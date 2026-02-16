# Google Cloud Deployment Guide

This guide explains how to deploy QAMP on Google Cloud (Compute Engine or Cloud Run).

## Prerequisites

- Google Cloud account with billing enabled
- `gcloud` CLI installed (or use Cloud Shell)
- PM2 for process management
- Node.js 18+ and Python 3.8+

## Option 1: Google Compute Engine (VM) - Recommended

### 1. Create a VM Instance

```bash
gcloud compute instances create qamp-server \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --tags=http-server,https-server
```

### 2. Connect to Your VM

```bash
gcloud compute ssh qamp-server --zone=us-central1-a
```

### 3. Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python 3.11
sudo apt install -y python3.11 python3.11-venv python3-pip

# Install PM2 globally
sudo npm install -g pm2

# Install Git
sudo apt install -y git
```

### 4. Clone Your Repository

```bash
# Clone your repo
git clone https://github.com/your-username/qamp.git
cd qamp
```

### 5. Set Up Environment Variables

```bash
# Create .env file in project root
nano .env
```

Paste your configuration:

```env
# OpenAI Configuration
AI_TC_GEN_OPENAI_API_KEY=your-key-here

# Gemini Configuration
AI_TC_GEN_GEMINI_API_KEY=your-key-here

# Groq Configuration
AI_TC_GEN_GROQ_API_KEY=your-key-here

# Backend Settings
AI_TC_GEN_DEFAULT_LLM_PROVIDER=openai
AI_TC_GEN_OLLAMA_BASE_URL=http://localhost:11434
AI_TC_GEN_OLLAMA_MODEL=llama3.2:3b

# Authentication (CHANGE THESE!)
AI_TC_GEN_AUTH_USERNAME=admin
AI_TC_GEN_AUTH_PASSWORD=your-secure-password-here
AI_TC_GEN_JWT_SECRET=your-secret-jwt-key-here
```

Save with `Ctrl+O`, `Enter`, then `Ctrl+X`

### 6. Create Frontend .env

```bash
nano frontend/.env
```

Add:

```env
# For production with external access, use your VM's external IP
VITE_API_BASE_URL=http://YOUR_VM_EXTERNAL_IP:8000
```

To find your external IP:
```bash
curl -s http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H "Metadata-Flavor: Google"
```

Or use a domain if you have one set up:
```env
VITE_API_BASE_URL=https://api.yourdomain.com
```

### 7. Install Application Dependencies

```bash
# Backend dependencies
cd backend
python3 -m pip install -r requirements.txt
cd ..

# Frontend dependencies
cd frontend
npm install
cd ..
```

### 8. Make Scripts Executable

```bash
chmod +x start-pm2.sh
chmod +x stop-pm2.sh
```

### 9. Start the Application

```bash
./start-pm2.sh
```

Or manually:
```bash
cd frontend && npm run build && cd ..
pm2 start ecosystem.config.js
pm2 save
```

### 10. Set PM2 to Start on Boot

```bash
pm2 startup
# Copy and run the command it outputs (starts with sudo)
pm2 save
```

### 11. Configure Firewall Rules

Allow traffic on ports 8000 and 5173:

```bash
# Using gcloud CLI (from your local machine or Cloud Shell)
gcloud compute firewall-rules create allow-qamp-backend \
  --allow tcp:8000 \
  --target-tags=http-server \
  --description="Allow access to QAMP backend"

gcloud compute firewall-rules create allow-qamp-frontend \
  --allow tcp:5173 \
  --target-tags=http-server \
  --description="Allow access to QAMP frontend"
```

### 12. Access Your Application

Get your external IP:
```bash
curl -s http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H "Metadata-Flavor: Google"
```

Access:
- **Frontend**: `http://YOUR_EXTERNAL_IP:5173`
- **Backend API**: `http://YOUR_EXTERNAL_IP:8000`
- **API Docs**: `http://YOUR_EXTERNAL_IP:8000/docs`

## Option 2: Using Nginx Reverse Proxy (Recommended for Production)

### 1. Install Nginx

```bash
sudo apt install -y nginx
```

### 2. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/qamp
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # or use your VM IP

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend docs
    location /docs {
        proxy_pass http://localhost:8000/docs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /openapi.json {
        proxy_pass http://localhost:8000/openapi.json;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

### 3. Enable the Site

```bash
sudo ln -s /etc/nginx/sites-available/qamp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Update Frontend .env

```bash
nano frontend/.env
```

Change to use relative URLs (empty string):
```env
VITE_API_BASE_URL=
```

### 5. Rebuild Frontend and Restart

```bash
cd frontend
npm run build
cd ..
pm2 restart qamp-frontend
```

### 6. Update Firewall

Only port 80 (and 443 for HTTPS) needs to be open:

```bash
gcloud compute firewall-rules create allow-http \
  --allow tcp:80 \
  --target-tags=http-server

gcloud compute firewall-rules create allow-https \
  --allow tcp:443 \
  --target-tags=https-server
```

### 7. Access Your Application

Now accessible at: `http://YOUR_EXTERNAL_IP`

## Option 3: Add SSL/HTTPS with Let's Encrypt

### 1. Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 2. Get SSL Certificate

**Important**: You need a domain name pointing to your VM IP first!

```bash
sudo certbot --nginx -d your-domain.com
```

Follow the prompts. Certbot will automatically configure Nginx for HTTPS.

### 3. Update Frontend .env

```bash
nano frontend/.env
```

```env
VITE_API_BASE_URL=https://your-domain.com
```

### 4. Rebuild and Restart

```bash
cd frontend
npm run build
cd ..
pm2 restart qamp-frontend
```

### 5. Auto-Renewal

Certbot auto-renewal is set up automatically. Test it:
```bash
sudo certbot renew --dry-run
```

## Monitoring and Management

### Check Application Status

```bash
pm2 status
pm2 monit
```

### View Logs

```bash
# All logs
pm2 logs

# Specific process
pm2 logs qamp-backend
pm2 logs qamp-frontend

# Log files
tail -f logs/backend-error.log
tail -f logs/frontend-error.log
```

### Restart Application

```bash
pm2 restart all
# or
./stop-pm2.sh && ./start-pm2.sh
```

### Update Application

```bash
# Stop PM2
./stop-pm2.sh

# Pull latest changes
git pull

# Install dependencies if needed
cd backend && pip install -r requirements.txt && cd ..
cd frontend && npm install && cd ..

# Restart
./start-pm2.sh
```

## Troubleshooting

### Port Already in Use

```bash
# Find what's using port 8000
sudo lsof -i :8000
# or
sudo netstat -tlnp | grep :8000

# Kill the process
sudo kill -9 <PID>
```

### Check Firewall Rules

```bash
# List firewall rules
gcloud compute firewall-rules list

# Check if VM has correct tags
gcloud compute instances describe qamp-server --zone=us-central1-a | grep tags -A 5
```

### Python Module Not Found

```bash
cd backend
python3 -m pip install --upgrade -r requirements.txt
cd ..
pm2 restart qamp-backend
```

### Frontend Build Fails

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
cd ..
pm2 restart qamp-frontend
```

### Can't Connect from Outside

1. **Check firewall rules** are created and applied
2. **Check VM network tags** include `http-server`
3. **Check nginx** is running: `sudo systemctl status nginx`
4. **Check PM2** processes: `pm2 status`
5. **Check logs**: `pm2 logs`

### Backend Can't Load .env

```bash
# Check .env exists
ls -la .env

# Check ecosystem.config.js
cat ecosystem.config.js | grep -A 5 "env:"

# Check PM2 environment
pm2 env qamp-backend | grep AI_TC_GEN
```

## Cost Optimization

### Use Preemptible VM (Cheaper)

```bash
gcloud compute instances create qamp-server \
  --preemptible \
  --machine-type=e2-small \
  # ... other flags
```

**Note**: Preemptible VMs can be shut down at any time. Use with PM2 startup script.

### Stop VM When Not in Use

```bash
# Stop (keeps disk, cheaper than running)
gcloud compute instances stop qamp-server --zone=us-central1-a

# Start again
gcloud compute instances start qamp-server --zone=us-central1-a
```

### Use Smaller Machine Type

For light usage, `e2-micro` or `e2-small` may suffice:
```bash
gcloud compute instances set-machine-type qamp-server \
  --machine-type=e2-small \
  --zone=us-central1-a
```

## Security Best Practices

1. ✅ Change default credentials in `.env`
2. ✅ Use strong JWT secret
3. ✅ Enable firewall rules (only open necessary ports)
4. ✅ Use HTTPS with Let's Encrypt
5. ✅ Keep system updated: `sudo apt update && sudo apt upgrade`
6. ✅ Set up automatic security updates
7. ✅ Use service accounts with minimal permissions
8. ✅ Don't commit `.env` to repository
9. ✅ Regularly backup database: `backend/testcases.db`
10. ✅ Monitor PM2 logs for suspicious activity

## Database Backup

### Manual Backup

```bash
# Create backup
cp backend/testcases.db backend/testcases.db.backup-$(date +%Y%m%d-%H%M%S)

# Or compress
tar -czf testcases-backup-$(date +%Y%m%d-%H%M%S).tar.gz backend/testcases.db
```

### Automated Daily Backup

```bash
# Create backup script
nano ~/backup-qamp.sh
```

Add:
```bash
#!/bin/bash
BACKUP_DIR="/home/$USER/qamp-backups"
mkdir -p $BACKUP_DIR
cd ~/qamp
tar -czf $BACKUP_DIR/testcases-$(date +%Y%m%d-%H%M%S).tar.gz backend/testcases.db
# Keep only last 7 days
find $BACKUP_DIR -name "testcases-*.tar.gz" -mtime +7 -delete
```

Make executable:
```bash
chmod +x ~/backup-qamp.sh
```

Add to crontab (daily at 2 AM):
```bash
crontab -e
```
Add line:
```
0 2 * * * /home/your-username/backup-qamp.sh
```

## Quick Command Reference

```bash
# Application management
./start-pm2.sh              # Start application
./stop-pm2.sh               # Stop application
pm2 status                  # Check status
pm2 logs                    # View logs
pm2 restart all             # Restart all

# System management
sudo systemctl status nginx # Check nginx
sudo nginx -t               # Test nginx config
sudo systemctl restart nginx # Restart nginx

# Firewall
sudo ufw status             # Check firewall (if using ufw)
gcloud compute firewall-rules list  # List GCP firewall rules

# Updates
git pull                    # Update code
cd frontend && npm run build && cd ..  # Rebuild frontend
pm2 restart all             # Restart application

# Monitoring
pm2 monit                   # Live monitoring
pm2 logs --lines 100        # Last 100 log lines
df -h                       # Check disk space
free -h                     # Check memory
```

## Summary

Your QAMP application should now be running on Google Cloud! 🎉

**Access points**:
- With nginx: `http://YOUR_EXTERNAL_IP/`
- With SSL: `https://your-domain.com/`
- Without nginx: `http://YOUR_EXTERNAL_IP:5173/`

**Key files on VM**:
- `/home/your-username/qamp/` - Application directory
- `/home/your-username/qamp/.env` - Backend configuration
- `/home/your-username/qamp/frontend/.env` - Frontend configuration
- `/etc/nginx/sites-available/qamp` - Nginx configuration
