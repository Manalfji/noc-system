-- Zabbix database initialization
CREATE DATABASE IF NOT EXISTS zabbix CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
GRANT ALL PRIVILEGES ON zabbix.* TO 'zabbix'@'%';
FLUSH PRIVILEGES;
