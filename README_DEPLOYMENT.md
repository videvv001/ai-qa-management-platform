# QAMP Deployment Guide - Quick Reference

This is a quick reference for deploying QAMP. For detailed guides, see the platform-specific documentation.

## Choose Your Platform

### 🪟 Windows (Local/Server)
- Use PowerShell scripts: `.\start-pm2.ps1` and `.\stop-pm2.ps1`
- See: `PM2_QUICK_START.md` and `PRODUCTION_DEPLOYMENT.md`

### 🐧 Linux/Unix (Google Cloud, AWS, DigitalOcean, etc.)
- Use Bash scripts: `./start-pm2.sh` and `./stop-pm2.sh`
- See: `GOOGLE_CLOUD_DEPLOYMENT.md`

### 🍎 macOS
- Use Bash scripts: `./start-pm2.sh` and `./stop-pm2.sh`
- Follow Linux instructions

## Quick Start by Platform

### Windows

```powershell
# 1. Install PM2
npm install -g pm2

# 2. Configure environment
# Edit .env in project root
# Edit frontend/.env

# 3. Start application
.\start-pm2.ps1

# 4. Access
# Frontend: http://localhost:5173
# Backend: http://localhost:8000
```

### Linux/Mac/Google Cloud

```bash
# 1. Install PM2
npm install -g pm2

# 2. Configure environment
# Edit .env in project root
nano .env

# Edit frontend/.env
nano frontend/.env

# 3. Make scripts executable
chmod +x start-pm2.sh stop-pm2.sh

# 4. Start application
./start-pm2.sh

# 5. Access
# Frontend: http://localhost:5173
# Backend: http://localhost:8000
```

### Using npm Scripts (Cross-Platform)

```bash
# Build and start (recommended first time)
npm run pm2:build-start

# Or build manually then start
cd frontend && npm run build && cd ..
npm run pm2:start

# Manage
npm run pm2:status
npm run pm2:logs
npm run pm2:restart
npm run pm2:stop
```

## Environment Files Required

### `.env` (Project Root)
Contains backend configuration and API keys:
```env
AI_TC_GEN_OPENAI_API_KEY=your-key
AI_TC_GEN_GEMINI_API_KEY=your-key
AI_TC_GEN_GROQ_API_KEY=your-key
AI_TC_GEN_DEFAULT_LLM_PROVIDER=ollama
AI_TC_GEN_AUTH_USERNAME=admin
AI_TC_GEN_AUTH_PASSWORD=your-password
AI_TC_GEN_JWT_SECRET=your-secret
```

### `frontend/.env`
Contains API endpoint URL:
```env
# Local/development
VITE_API_BASE_URL=http://localhost:8000

# Production (replace with your domain/IP)
VITE_API_BASE_URL=https://your-domain.com

# When using reverse proxy (nginx)
VITE_API_BASE_URL=
```

## Common Commands

### Process Management
```bash
pm2 status                 # Check status
pm2 logs                   # View logs
pm2 restart all            # Restart all
pm2 stop all               # Stop all
pm2 delete all             # Remove all processes
pm2 monit                  # Monitor in real-time
```

### Startup on Boot
```bash
# Windows
pm2 save
pm2 startup

# Linux/Mac
pm2 save
pm2 startup
# Run the command it outputs
```

### Update Application
```bash
# Stop processes
pm2 delete all  # or ./stop-pm2.sh or .\stop-pm2.ps1

# Pull latest code
git pull

# Install dependencies if changed
cd backend && pip install -r requirements.txt && cd ..
cd frontend && npm install && cd ..

# Rebuild frontend
cd frontend && npm run build && cd ..

# Start again
./start-pm2.sh  # Linux/Mac
# or
.\start-pm2.ps1  # Windows
```

## Platform-Specific Guides

| Platform | Guide | Scripts |
|----------|-------|---------|
| Windows Local/Server | `PRODUCTION_DEPLOYMENT.md` | `start-pm2.ps1`, `stop-pm2.ps1` |
| Google Cloud | `GOOGLE_CLOUD_DEPLOYMENT.md` | `start-pm2.sh`, `stop-pm2.sh` |
| Linux/Unix/Mac | `GOOGLE_CLOUD_DEPLOYMENT.md` | `start-pm2.sh`, `stop-pm2.sh` |
| Quick Start | `PM2_QUICK_START.md` | All platforms |
| Verification | `VERIFICATION_CHECKLIST.md` | Pre-deployment checks |

## Troubleshooting

### Scripts Won't Run

**Windows:**
```powershell
# If execution policy error
powershell -ExecutionPolicy Bypass -File .\start-pm2.ps1
```

**Linux/Mac:**
```bash
# Make executable
chmod +x start-pm2.sh stop-pm2.sh

# Then run
./start-pm2.sh
```

### Port Already in Use

**Windows:**
```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**Linux/Mac:**
```bash
sudo lsof -i :8000
sudo kill -9 <PID>
```

### Environment Variables Not Loading

1. Check `.env` exists in **project root** (not in backend/)
2. Check file has correct variable names (prefix: `AI_TC_GEN_`)
3. Restart PM2: `pm2 restart all`
4. Check PM2 environment: `pm2 env qamp-backend`

### Frontend Can't Connect to Backend

1. Check `frontend/.env` has correct `VITE_API_BASE_URL`
2. Rebuild frontend: `cd frontend && npm run build && cd ..`
3. Restart: `pm2 restart qamp-frontend`
4. Check backend is running: `curl http://localhost:8000/api/health`

## File Structure

```
qamp/
├── .env                          # Backend config (REQUIRED)
├── ecosystem.config.js           # PM2 configuration
├── start-pm2.ps1                # Windows start script
├── stop-pm2.ps1                 # Windows stop script
├── start-pm2.sh                 # Linux/Mac start script
├── stop-pm2.sh                  # Linux/Mac stop script
├── logs/                        # PM2 logs
├── backend/
│   ├── app/
│   ├── requirements.txt
│   └── testcases.db             # SQLite database
└── frontend/
    ├── .env                     # Frontend API URL (REQUIRED)
    ├── dist/                    # Built frontend
    └── package.json
```

## Security Checklist

- [ ] Change `AI_TC_GEN_AUTH_USERNAME` from default
- [ ] Change `AI_TC_GEN_AUTH_PASSWORD` from default
- [ ] Set strong `AI_TC_GEN_JWT_SECRET` (generate: `openssl rand -hex 32`)
- [ ] Don't commit `.env` files to git
- [ ] Use HTTPS in production (nginx + Let's Encrypt)
- [ ] Restrict firewall to only necessary ports
- [ ] Keep dependencies updated
- [ ] Regular database backups

## Need Help?

1. **Quick Start**: Read `PM2_QUICK_START.md`
2. **Windows**: Read `PRODUCTION_DEPLOYMENT.md`
3. **Google Cloud**: Read `GOOGLE_CLOUD_DEPLOYMENT.md`
4. **Troubleshooting**: Read `VERIFICATION_CHECKLIST.md`
5. **Check Logs**: `pm2 logs --lines 100`
6. **Check Status**: `pm2 status`

## Support

For issues:
1. Check PM2 logs: `pm2 logs`
2. Check log files in `logs/` directory
3. Verify environment files exist and are correct
4. Try stopping and starting again
5. Check firewall/network rules
