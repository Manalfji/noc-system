#!/usr/bin/env python3
"""
Zabbix API Proxy for NOC Dashboard
Handles authentication and returns host data
"""

import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime, timedelta

# Zabbix configuration
ZABBIX_URL = "http://localhost:8081/api_jsonrpc.php"
ZABBIX_USER = "Admin"
ZABBIX_PASSWORD = "***"

class ZabbixAPI:
    def __init__(self):
        self.auth_token = None
        self.token_expiry = None
    
    def login(self):
        """Authenticate with Zabbix and get token"""
        data = {
            "jsonrpc": "2.0",
            "method": "user.login",
            "params": {
                "username": ZABBIX_USER,
                "password": ZABBIX_PASSWORD
            },
            "id": 1
        }
        
        try:
            req = urllib.request.Request(
                ZABBIX_URL,
                data=json.dumps(data).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            
            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode('utf-8'))
                self.auth_token = result.get('result')
                self.token_expiry = datetime.now() + timedelta(hours=1)
                return self.auth_token
        except Exception as e:
            print(f"Login error: {e}")
            return None
    
    def get_hosts(self):
        """Fetch hosts from Zabbix"""
        if not self.auth_token or datetime.now() > self.token_expiry:
            self.login()
        
        if not self.auth_token:
            return []
        
        data = {
            "jsonrpc": "2.0",
            "method": "host.get",
            "params": {
                "output": ["hostid", "host", "name", "status"],
                "selectInterfaces": ["ip"],
                "selectTriggers": ["description", "priority", "status"],
                "filter": {"status": "0"}  # Only monitored hosts
            },
            "auth": self.auth_token,
            "id": 2
        }
        
        try:
            req = urllib.request.Request(
                ZABBIX_URL,
                data=json.dumps(data).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            
            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode('utf-8'))
                return result.get('result', [])
        except Exception as e:
            print(f"Get hosts error: {e}")
            return []

zabbix = ZabbixAPI()

class ProxyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests"""
        if self.path == '/api/zabbix/hosts':
            hosts = zabbix.get_hosts()
            
            # Process hosts for dashboard
            processed_hosts = []
            for host in hosts:
                # Count triggers by severity
                triggers = host.get('triggers', [])
                critical = sum(1 for t in triggers if t.get('priority') in ['4', '5'] and t.get('status') == '0')
                warning = sum(1 for t in triggers if t.get('priority') in ['2', '3'] and t.get('status') == '0')
                
                processed_hosts.append({
                    'hostid': host.get('hostid'),
                    'name': host.get('name'),
                    'ip': host.get('interfaces', [{}])[0].get('ip', 'N/A'),
                    'status': 'online' if host.get('status') == '0' else 'offline',
                    'critical': critical,
                    'warning': warning
                })
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(processed_hosts).encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        """Suppress default logging"""
        pass

def run_server(port=8091):
    server = HTTPServer(('0.0.0.0', port), ProxyHandler)
    print(f"Zabbix proxy server running on port {port}")
    server.serve_forever()

if __name__ == '__main__':
    run_server()
