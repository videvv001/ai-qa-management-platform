# Production

Checklist and practices for running QAMP in production.

---

## Production checklist

- [ ] `.env` in project root with required variables
- [ ] `AI_TC_GEN_JWT_SECRET` set to a secure random value (`openssl rand -hex 32`)
- [ ] `AI_TC_GEN_AUTH_PASSWORD` changed from default
- [ ] `frontend/.env` has correct `VITE_API_BASE_URL` (or empty if using nginx)
- [ ] Frontend built: `cd frontend && npm run build`
- [ ] Backend deps: `pip install -r backend/requirements.txt`
- [ ] Frontend deps: `npm install` in `frontend/`
- [ ] PM2 installed: `npm install -g pm2`
- [ ] Firewall allows needed ports (8000, 5173, or 80/443 with nginx)
- [ ] PM2 persisted: `pm2 save` and `pm2 startup` run

---

## Security

1. Change default auth credentials in `.env`.
2. Use a strong JWT secret in production.
3. Use HTTPS (e.g. nginx + Let's Encrypt); see [deployment.md](deployment.md#4-https-nginx--lets-encrypt).
4. Restrict filesystem access to `.env` (e.g. `chmod 600 .env`).
5. Restrict firewall to required ports only.
6. Keep OS and dependencies updated.
7. Do not commit `.env` (already in `.gitignore`).
8. Monitor PM2 logs for anomalies.

---

## Database backup

### Manual

```bash
cp backend/testcases.db backend/testcases.db.backup-$(date +%Y%m%d-%H%M%S)
# or compressed
tar -czf testcases-backup-$(date +%Y%m%d-%H%M%S).tar.gz backend/testcases.db
```

### Automated (example: daily at 2 AM)

```bash
# ~/backup-qamp.sh
#!/bin/bash
BACKUP_DIR="/home/$USER/qamp-backups"
mkdir -p "$BACKUP_DIR"
cd ~/qamp
tar -czf "$BACKUP_DIR/testcases-$(date +%Y%m%d-%H%M%S).tar.gz" backend/testcases.db
find "$BACKUP_DIR" -name "testcases-*.tar.gz" -mtime +7 -delete
```

```bash
chmod +x ~/backup-qamp.sh
crontab -e
# Add: 0 2 * * * /home/YOUR_USERNAME/backup-qamp.sh
```

---

## PM2 persistence

To start PM2 processes after reboot:

```bash
pm2 startup
# Run the command it prints (e.g. sudo env PATH=...)
pm2 save
```

---

## Changing ports

- **Backend:** Edit the port in `run-backend.js` (uvicorn arguments).
- **Frontend:** Edit `server.port` in `frontend/vite.config.ts`.  
Update `frontend/.env` (`VITE_API_BASE_URL`) if the backend URL or port changes.
