#!/bin/bash
set -euo pipefail

echo "NOC System v2.0.0 Installer"

if [ "$EUID" -ne 0 ]; then
    echo "Error: Please run as root or with sudo"
    exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release

if ! command -v docker &> /dev/null; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable docker
    systemctl start docker
fi

mkdir -p /opt/noc-system
cp -r "$(dirname "$0")"/* /opt/noc-system/
cd /opt/noc-system

mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/ssl/noc-dashboard.key \
    -out nginx/ssl/noc-dashboard.crt \
    -subj "/C=DE/ST=State/L=City/O=NOC/CN=noc-dashboard.local" 2>/dev/null || true

htpasswd -cb nginx/htpasswd "NOC-Admin" "A1b2c3"

cat > .env << 'ENVEOF'
MYSQL_ROOT_PASSWORD=***
MYSQL_DATABASE=zabbix
MYSQL_USER=zabbix
MYSQL_PASSWORD=***
ZABBIX_URL=http://zabbix-web:8080
ZABBIX_USER=Admin
ZABBIX_PASSWORD=***
ADAPTER_PORT=3000
WEBSOCKET_PORT=3001
POLL_INTERVAL=5000
LOG_LEVEL=info
ENVEOF

docker compose pull
docker compose up -d

echo "NOC System v2.0.0 installed successfully!"
echo "Access: https://$(hostname -I | awk '{print $1}')"
echo "Login: NOC-Admin / A1b2c3"
