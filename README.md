# NOC System

Network Operations Center Dashboard with Zabbix Integration

## Overview

This repository contains the NOC (Network Operations Center) Dashboard with integrated Zabbix monitoring and backup utilities.

## Features

### NOC Dashboard (`noc-dashboard-pro.html`)
- Real-time Zabbix host monitoring
- Live topology visualization
- Host status tracking (online/offline)
- Critical and warning trigger counts
- Auto-refresh every 30 seconds
- Dark theme with glass-morphism UI

### Zabbix Integration
- **Zabbix Database Proxy** (`zabbix-db-proxy.py`) - Direct MySQL connection for efficient data retrieval
- **systemd Service** (`zabbix-proxy.service`) - Auto-starts on boot
- Connects to Zabbix 7.0+ databases
- Exposes REST API on port 8091

### Backup Script (`Backup-Flat-Dated.ps1`)
- Selective backup based on date patterns in filenames
- Organizes backups by year-month folders
- Configurable days back parameter
- Supports flat source structure with dated filenames

## Installation

### Prerequisites
- Docker with Zabbix containers running
- Python 3.12+ with pymysql
- Systemd (for Linux installations)

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Manalfji/noc-system.git
   cd noc-system
   ```

2. **Install the Zabbix proxy service:**
   ```bash
   sudo cp zabbix-proxy.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable zabbix-proxy
   sudo systemctl start zabbix-proxy
   ```

3. **Configure database connection:**
   Edit `zabbix-db-proxy.py` and update the database credentials.

4. **Open the dashboard:**
   Open `noc-dashboard-pro.html` in a web browser.

## Usage

### NOC Dashboard
- Access the dashboard by opening `noc-dashboard-pro.html`
- The dashboard auto-refreshes every 30 seconds
- Click on nodes to see detailed information
- Monitor host status and trigger counts in real-time

### Backup Script
```powershell
# Set days back (0 = today, 1 = today + yesterday, etc.)
$DaysBack = 1

# Run the script
.\Backup-Flat-Dated.ps1
```

### API Endpoints

#### Get Zabbix Hosts
```
GET http://localhost:8091/api/zabbix/hosts
```

## Service Management

```bash
# Check service status
sudo systemctl status zabbix-proxy

# Restart service
sudo systemctl restart zabbix-proxy

# View logs
sudo journalctl -u zabbix-proxy -f
```

## Files

| File | Description |
|------|-------------|
| `noc-dashboard-pro.html` | Main NOC dashboard |
| `zabbix-db-proxy.py` | Database proxy for Zabbix |
| `zabbix-proxy.py` | Alternative API proxy |
| `zabbix-proxy.service` | systemd service configuration |
| `Backup-Flat-Dated.ps1` | Windows backup script |
