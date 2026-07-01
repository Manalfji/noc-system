#!/usr/bin/env python3
"""
Zabbix Database Proxy for NOC Dashboard
Direct MySQL connection to fetch host data without API authentication
"""

import json
import pymysql
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime

# Database configuration
DB_CONFIG = {
    'host': '172.19.0.4',
    'user': 'proxy',
    'password': '***',
    'database': 'zabbix',
    'port': 3306,
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor
}

class ZabbixDBProxy:
    def __init__(self):
        self.connection = None
    
    def connect(self):
        """Connect to Zabbix database"""
        try:
            self.connection = pymysql.connect(**DB_CONFIG)
            return True
        except Exception as e:
            print(f"Database connection error: {e}")
            return False
    
    def get_hosts(self):
        """Fetch hosts from Zabbix database"""
        if not self.connection:
            if not self.connect():
                return []
        
        try:
            with self.connection.cursor() as cursor:
                # Get hosts with their status
                sql = """
                SELECT h.hostid, h.host, h.name, h.status,
                       hi.ip
                FROM hosts h
                LEFT JOIN interface hi ON h.hostid = hi.hostid AND hi.main = 1
                WHERE h.status IN (0, 1)
                ORDER BY h.name
                """
                cursor.execute(sql)
                hosts = cursor.fetchall()
                
                # Get trigger counts for each host
                for host in hosts:
                    hostid = host['hostid']
                    
                    # Count critical triggers (priority 4-5, enabled)
                    cursor.execute("""
                        SELECT COUNT(*) as count
                        FROM triggers t
                        JOIN functions f ON t.triggerid = f.triggerid
                        JOIN items i ON f.itemid = i.itemid
                        WHERE i.hostid = %s AND t.priority IN (4, 5) 
                        AND t.status = 0 AND t.value = 1
                    """, (hostid,))
                    critical = cursor.fetchone()['count']
                    
                    # Count warning triggers (priority 2-3, enabled)
                    cursor.execute("""
                        SELECT COUNT(*) as count
                        FROM triggers t
                        JOIN functions f ON t.triggerid = f.triggerid
                        JOIN items i ON f.itemid = i.itemid
                        WHERE i.hostid = %s AND t.priority IN (2, 3) 
                        AND t.status = 0 AND t.value = 1
                    """, (hostid,))
                    warning = cursor.fetchone()['count']
                    
                    host['critical'] = critical
                    host['warning'] = warning
                
                return hosts
        except Exception as e:
            print(f"Query error: {e}")
            return []
    
    def close(self):
        if self.connection:
            self.connection.close()

zabbix_db = ZabbixDBProxy()

class ProxyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/zabbix/hosts':
            hosts = zabbix_db.get_hosts()
            
            # Process hosts for dashboard
            processed_hosts = []
            for host in hosts:
                processed_hosts.append({
                    'hostid': host['hostid'],
                    'name': host['name'] or host['host'],
                    'ip': host['ip'] or 'N/A',
                    'status': 'online' if host['status'] == 0 else 'offline',
                    'critical': host.get('critical', 0),
                    'warning': host.get('warning', 0)
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
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        pass

def run_server(port=8091):
    server = HTTPServer(('0.0.0.0', port), ProxyHandler)
    print(f"Zabbix DB proxy server running on port {port}")
    server.serve_forever()

if __name__ == '__main__':
    run_server()
