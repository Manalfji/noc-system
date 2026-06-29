/**
 * NOC Zabbix ↔ OpenMCT Adapter v2.0.0
 */

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const axios = require('axios');
const cron = require('node-cron');
const winston = require('winston');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const config = {
  zabbix: {
    url: process.env.ZABBIX_URL || 'http://zabbix-web:8080',
    user: process.env.ZABBIX_USER || 'Admin',
    password: process.env.ZABBIX_PASSWORD || 'zabbix',
    apiPath: '/api_jsonrpc.php'
  },
  adapter: {
    port: parseInt(process.env.ADAPTER_PORT) || 3000,
    wsPort: parseInt(process.env.WEBSOCKET_PORT) || 3001,
    pollInterval: parseInt(process.env.POLL_INTERVAL) || 5000,
    logLevel: process.env.LOG_LEVEL || 'info'
  }
};

const logger = winston.createLogger({
  level: config.adapter.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: '/app/logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: '/app/logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

logger.info('NOC Adapter starting...', { version: '2.0.0' });

class ZabbixAPI {
  constructor() {
    this.url = config.zabbix.url + config.zabbix.apiPath;
    this.authToken = null;
    this.requestId = 0;
  }

  async login() {
    try {
      const response = await axios.post(this.url, {
        jsonrpc: '2.0',
        method: 'user.login',
        params: {
          username: config.zabbix.user,
          password: config.zabbix.password
        },
        id: ++this.requestId
      });

      if (response.data.error) {
        throw new Error('Zabbix login error: ' + response.data.error.data);
      }

      this.authToken = response.data.result;
      logger.info('Zabbix authentication successful');
      return true;
    } catch (error) {
      logger.error('Zabbix login failed:', error.message);
      return false;
    }
  }

  async request(method, params = {}) {
    if (!this.authToken) {
      await this.login();
    }

    try {
      const response = await axios.post(this.url, {
        jsonrpc: '2.0',
        method: method,
        params: Object.assign({}, params, { auth: this.authToken }),
        id: ++this.requestId
      });

      if (response.data.error) {
        if (response.data.error.code === -32602) {
          await this.login();
          return this.request(method, params);
        }
        throw new Error('Zabbix API error: ' + response.data.error.data);
      }

      return response.data.result;
    } catch (error) {
      logger.error('API request failed (' + method + '):', error.message);
      throw error;
    }
  }

  async getHosts() {
    return this.request('host.get', {
      output: ['hostid', 'host', 'name', 'status', 'available'],
      selectInterfaces: ['ip', 'dns'],
      filter: { status: 0 }
    });
  }

  async getItems(hostId) {
    return this.request('item.get', {
      output: ['itemid', 'name', 'key_', 'lastvalue', 'lastclock', 'value_type', 'units'],
      hostids: hostId,
      filter: { status: 0 }
    });
  }

  async getTriggers() {
    return this.request('trigger.get', {
      output: ['triggerid', 'description', 'priority', 'status', 'value', 'lastchange'],
      selectHosts: ['hostid', 'name'],
      filter: { status: 0 },
      sortfield: 'lastchange',
      sortorder: 'DESC',
      limit: 100
    });
  }
}

class OpenMCTTransform {
  static hostToDomainObject(host) {
    return {
      identifier: {
        namespace: 'zabbix',
        key: 'host.' + host.hostid
      },
      type: 'folder',
      name: host.name || host.host,
      location: 'ROOT',
      composition: []
    };
  }

  static itemToTelemetryObject(item, hostId) {
    return {
      identifier: {
        namespace: 'zabbix',
        key: 'item.' + item.itemid
      },
      type: 'telemetry',
      name: item.name,
      location: 'zabbix:host.' + hostId,
      telemetry: {
        values: [
          {
            key: 'value',
            name: 'Value',
            unit: item.units || '',
            format: this.getValueFormat(item.value_type)
          },
          {
            key: 'timestamp',
            name: 'Timestamp',
            format: 'timestamp'
          }
        ]
      }
    };
  }

  static getValueFormat(valueType) {
    const formats = {
      '0': 'float',
      '1': 'string',
      '2': 'string',
      '3': 'integer',
      '4': 'float',
      '5': 'float'
    };
    return formats[valueType] || 'string';
  }

  static triggerToAlarm(trigger) {
    const severityMap = {
      '0': 'not-classified',
      '1': 'information',
      '2': 'warning',
      '3': 'average',
      '4': 'high',
      '5': 'disaster'
    };

    return {
      id: trigger.triggerid,
      name: trigger.description,
      severity: severityMap[trigger.priority] || 'unknown',
      status: trigger.value === '1' ? 'problem' : 'resolved',
      host: trigger.hosts && trigger.hosts[0] ? trigger.hosts[0].name : 'Unknown',
      timestamp: parseInt(trigger.lastchange) * 1000,
      acknowledged: false
    };
  }
}

class NOCAdapter {
  constructor() {
    this.zabbix = new ZabbixAPI();
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server, path: '/ws' });
    
    this.hosts = new Map();
    this.items = new Map();
    this.alarms = new Map();
    this.clients = new Set();
    
    this.setupExpress();
    this.setupWebSocket();
    this.startPolling();
  }

  setupExpress() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json());

    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        connections: this.clients.size
      });
    });

    this.app.get('/api/hosts', async (req, res) => {
      try {
        const hosts = Array.from(this.hosts.values());
        res.json(hosts.map(h => OpenMCTTransform.hostToDomainObject(h)));
      } catch (error) {
        logger.error('Error fetching hosts:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/items/:hostId', async (req, res) => {
      try {
        const hostItems = Array.from(this.items.values())
          .filter(item => item.hostid === req.params.hostId);
        res.json(hostItems.map(item => 
          OpenMCTTransform.itemToTelemetryObject(item, req.params.hostId)
        ));
      } catch (error) {
        logger.error('Error fetching items:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/alarms', async (req, res) => {
      try {
        const alarms = Array.from(this.alarms.values());
        res.json(alarms);
      } catch (error) {
        logger.error('Error fetching alarms:', error);
        res.status(500).json({ error: error.message });
      }
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      logger.info('WebSocket client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        logger.info('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.send(JSON.stringify({
        type: 'connection',
        status: 'connected',
        timestamp: Date.now()
      }));
    });
  }

  async startPolling() {
    await this.refreshData();

    cron.schedule('*/5 * * * * *', async () => {
      await this.refreshData();
    });

    logger.info('Polling started (interval: ' + config.adapter.pollInterval + 'ms)');
  }

  async refreshData() {
    try {
      const hosts = await this.zabbix.getHosts();
      hosts.forEach(host => this.hosts.set(host.hostid, host));

      for (const host of hosts) {
        const items = await this.zabbix.getItems(host.hostid);
        items.forEach(item => this.items.set(item.itemid, item));
      }

      const triggers = await this.zabbix.getTriggers();
      const newAlarms = new Map();
      triggers.forEach(trigger => {
        const alarm = OpenMCTTransform.triggerToAlarm(trigger);
        newAlarms.set(alarm.id, alarm);
      });
      this.alarms = newAlarms;

      this.broadcastUpdate();
    } catch (error) {
      logger.error('Error refreshing data:', error);
    }
  }

  broadcastUpdate() {
    const update = {
      type: 'update',
      timestamp: Date.now(),
      hosts: this.hosts.size,
      items: this.items.size,
      alarms: this.alarms.size
    };

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(update));
      }
    });
  }

  start() {
    this.server.listen(config.adapter.port, () => {
      logger.info('NOC Adapter running on port ' + config.adapter.port);
    });
  }
}

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

const adapter = new NOCAdapter();
adapter.start();
