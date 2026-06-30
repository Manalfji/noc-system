const express = require('express');
const axios = require('axios');
const WebSocket = require('ws');
const http = require('http');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Config
const ZABBIX_URL = process.env.ZABBIX_URL || 'http://zabbix-web:8080';
const ZABBIX_USER = process.env.ZABBIX_USER || 'Admin';
const ZABBIX_PASSWORD = process.env.ZABBIX_PASSWORD || 'zabbix';
const PORT = process.env.ADAPTER_PORT || 3000;
const WS_PORT = process.env.WEBSOCKET_PORT || 3001;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 5000;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NOC_ADMIN_USER = process.env.NOC_ADMIN_USER || 'NOC-Admin';
const NOC_ADMIN_PASSWORD = process.env.NOC_ADMIN_PASSWORD || 'A1b2c3';
const JWT_SECRET = process.env.JWT_SECRET || 'noc-secret-key-change-in-production';

// Auth middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (username !== NOC_ADMIN_USER || password !== NOC_ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { 
      httpOnly: true, 
      secure: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out' });
});

// Verify token endpoint
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ authenticated: true, user: req.user });
});

// Zabbix API proxy (protected)
app.post('/api/zabbix/*', authenticateToken, async (req, res) => {
  try {
    const response = await axios.post(`${ZABBIX_URL}/api_jsonrpc.php`, req.body, {
      headers: { 'Content-Type': 'application/json' }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Zabbix API error' });
  }
});

// Telemetry endpoint (protected)
app.get('/api/telemetry', authenticateToken, async (req, res) => {
  try {
    // Authenticate with Zabbix
    const authResponse = await axios.post(`${ZABBIX_URL}/api_jsonrpc.php`, {
      jsonrpc: '2.0',
      method: 'user.login',
      params: {
        username: ZABBIX_USER,
        password: ZABBIX_PASSWORD
      },
      id: 1
    });

    const authToken = authResponse.data.result;

    // Get problems/triggers
    const problemsResponse = await axios.post(`${ZABBIX_URL}/api_jsonrpc.php`, {
      jsonrpc: '2.0',
      method: 'problem.get',
      params: {
        output: 'extend',
        select_acknowledges: true,
        select_tags: true,
        sortfield: ['eventid'],
        sortorder: 'DESC',
        limit: 50
      },
      auth: authToken,
      id: 2
    });

    // Get hosts
    const hostsResponse = await axios.post(`${ZABBIX_URL}/api_jsonrpc.php`, {
      jsonrpc: '2.0',
      method: 'host.get',
      params: {
        output: ['hostid', 'host', 'name', 'status'],
        selectInterfaces: ['ip'],
        selectItems: ['name', 'lastvalue', 'units'],
        filter: { status: 0 }
      },
      auth: authToken,
      id: 3
    });

    // Logout
    await axios.post(`${ZABBIX_URL}/api_jsonrpc.php`, {
      jsonrpc: '2.0',
      method: 'user.logout',
      params: {},
      auth: authToken,
      id: 4
    });

    res.json({
      problems: problemsResponse.data.result || [],
      hosts: hostsResponse.data.result || [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Telemetry error:', error.message);
    res.status(500).json({ error: 'Failed to fetch telemetry' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket for real-time updates
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  const sendTelemetry = async () => {
    try {
      const authResponse = await axios.post(`${ZABBIX_URL}/api_jsonrpc.php`, {
        jsonrpc: '2.0',
        method: 'user.login',
        params: { username: ZABBIX_USER, password: ZABBIX_PASSWORD },
        id: 1
      });

      const authToken = authResponse.data.result;

      const problemsResponse = await axios.post(`${ZABBIX_URL}/api_jsonrpc.php`, {
        jsonrpc: '2.0',
        method: 'problem.get',
        params: { output: 'extend', limit: 50 },
        auth: authToken,
        id: 2
      });

      await axios.post(`${ZABBIX_URL}/api_jsonrpc.php`, {
        jsonrpc: '2.0',
        method: 'user.logout',
        params: {},
        auth: authToken,
        id: 3
      });

      ws.send(JSON.stringify({
        type: 'telemetry',
        data: problemsResponse.data.result || [],
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  };

  sendTelemetry();
  const interval = setInterval(sendTelemetry, POLL_INTERVAL);

  ws.on('close', () => {
    clearInterval(interval);
  });
});

// Serve login page
app.get('/login', (req, res) => {
  res.redirect('/login.html');
});

// Serve dashboard (check auth)
app.get('/', authenticateToken, (req, res) => {
  res.redirect('/dashboard');
});

server.listen(PORT, () => {
  console.log(`NOC Adapter running on port ${PORT}`);
  console.log(`WebSocket server on port ${WS_PORT}`);
});
