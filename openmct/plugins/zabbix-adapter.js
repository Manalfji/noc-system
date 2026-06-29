define(['openmct'], function (openmct) {
    'use strict';
    var ADAPTER_URL = window.NOC_CONFIG && window.NOC_CONFIG.adapterUrl ? window.NOC_CONFIG.adapterUrl : 'http://localhost:3000';
    var WS_URL = window.NOC_CONFIG && window.NOC_CONFIG.wsUrl ? window.NOC_CONFIG.wsUrl : 'ws://localhost:3001';

    var ZabbixHostProvider = {
        get: function (identifier) {
            return fetch(ADAPTER_URL + '/api/hosts')
                .then(function(res) { return res.json(); })
                .then(function(hosts) { return hosts.find(function(h) { return h.identifier.key === identifier.key; }); });
        },
        getRoots: function () {
            return fetch(ADAPTER_URL + '/api/hosts')
                .then(function(res) { return res.json(); })
                .then(function(hosts) { return hosts.map(function(h) { return h.identifier; }); });
        }
    };

    var ZabbixTelemetryProvider = {
        supportsSubscribe: function (domainObject) {
            return domainObject.type === 'telemetry';
        },
        subscribe: function (domainObject, callback) {
            var ws = new WebSocket(WS_URL + '/ws');
            ws.onopen = function () {
                ws.send(JSON.stringify({
                    type: 'subscribe',
                    itemIds: [domainObject.identifier.key.replace('item.', '')]
                }));
            };
            ws.onmessage = function (event) {
                var data = JSON.parse(event.data);
                if (data.type === 'update') {
                    callback({ timestamp: data.timestamp, value: data.value });
                }
            };
            return function () { ws.close(); };
        },
        supportsRequest: function (domainObject) {
            return domainObject.type === 'telemetry';
        },
        request: function (domainObject, options) {
            var itemId = domainObject.identifier.key.replace('item.', '');
            return fetch(ADAPTER_URL + '/api/history/' + itemId + '?limit=' + (options.size || 100))
                .then(function(res) { return res.json(); })
                .then(function(data) { return data.map(function(point) { return { timestamp: point.timestamp, value: point.value }; }); });
        }
    };

    return function install() {
        openmct.objects.addProvider('zabbix', ZabbixHostProvider);
        openmct.telemetry.addProvider(ZabbixTelemetryProvider);
        openmct.types.addType('zabbix.host', {
            name: 'Zabbix Host',
            description: 'Monitored host from Zabbix',
            cssClass: 'icon-telemetry'
        });
        openmct.types.addType('zabbix.telemetry', {
            name: 'Zabbix Metric',
            description: 'Real-time metric from Zabbix',
            cssClass: 'icon-telemetry'
        });
        console.log('[NOC] Zabbix Adapter Plugin loaded');
    };
});
