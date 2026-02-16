# QAMP Deployment Guide - Quick Reference

**One start command runs BOTH backend and frontend.** Use the scripts or `npm run start:prod`; you should see two PM2 processes: `qamp-backend` and `qamp-frontend`.

This is a quick reference for deploying QAMP (Linux/Mac/Google Cloud). For detailed guides, see the platform-specific documentation.

## Quick Start

### Linux / Mac / Google Cloud

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

### Using npm Scripts

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
pm2 save
pm2 startup
# Run the command it outputs
```

### Update Application
```bash
# Stop processes
pm2 delete all
# or
./stop-pm2.sh

# Pull latest code
git pull

# Install dependencies if changed
cd backend && pip install -r requirements.txt && cd ..
cd frontend && npm install && cd ..

# Rebuild frontend
cd frontend && npm run build && cd ..

# Start again
./start-pm2.sh
```

## Guides

| Guide | Description |
|-------|-------------|
| `PM2_QUICK_START.md` | Quick start guide |
| `PRODUCTION_DEPLOYMENT.md` | Detailed deployment |
| `GOOGLE_CLOUD_DEPLOYMENT.md` | Google Cloud setup |
| `VERIFICATION_CHECKLIST.md` | Pre-deployment checks |

## Troubleshooting

### Scripts Won't Run

```bash
# Make executable
chmod +x start-pm2.sh stop-pm2.sh

# Then run
./start-pm2.sh
```

### Port Already in Use

```bash
# Find what's using the port
sudo lsof -i :8000   # backend
sudo lsof -i :5173   # frontend

# Kill the process
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
├── run-backend.js                # Backend launcher (python3)
├── ecosystem.config.js           # PM2 config: starts BOTH backend + frontend
├── start-pm2.sh                  # Start both
├── stop-pm2.sh                   # Stop both
├── logs/                         # PM2 logs
├── backend/
│   ├── app/
│   ├── requirements.txt
│   └── testcases.db              # SQLite database
└── frontend/
    ├── .env                      # Frontend API URL (REQUIRED)
    ├── dist/                     # Built frontend
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
2. **Google Cloud**: Read `GOOGLE_CLOUD_DEPLOYMENT.md`
3. **Troubleshooting**: Read `VERIFICATION_CHECKLIST.md`
4. **Check Logs**: `pm2 logs --lines 100`
5. **Check Status**: `pm2 status`
