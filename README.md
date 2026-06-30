# NOC System v2.0.0

Network Operations Center system combining NASA OpenMCT and Zabbix 7.4 monitoring.

## Features
- Real-time telemetry visualization with OpenMCT
- Zabbix 7.4 integration for monitoring
- Production-ready Docker deployment
- WebSocket-based real-time updates
- SSL/TLS encryption
- Basic authentication (NOC-Admin / A1b2c3)

## Requirements
- Debian 12 or 13
- 6GB RAM minimum
- 30GB disk space
- Internet connection

## Quick Start
\`\`\`bash
git clone https://github.com/Manalfji/noc-system.git
cd noc-system
sudo bash install.sh
\`\`\`

## Access
| Service | URL | Credentials |
|---------|-----|-------------|
| NOC Dashboard | https://your-server | NOC-Admin / A1b2c3 |
| Zabbix Web | https://your-server:8443 | Admin / zabbix |

## Architecture
```
Nginx (SSL/Auth) -> OpenMCT (Frontend) -> Adapter (Bridge) -> Zabbix 7.4
```

## Management
\`\`\`bash
docker compose ps        # View status
docker compose logs -f   # View logs
docker compose restart   # Restart services
docker compose down      # Stop services
\`\`\`

## Version
v2.0.0 - Production Release
# Test Tue Jun 30 08:02:06 AM PDT 2026
