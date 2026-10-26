apt update && apt upgrade -y
systemctl status lumen-agent
journalctl -u lumen-agent --since today
