# PM2 Quick Start Guide

## The Problem (Fixed!)

Your `.env` file was in the project root, but when PM2 ran the backend, it couldn't properly load the environment variables, causing the API to not work even though the backend status showed "good".

## What Was Fixed

1. ✅ Created `ecosystem.config.js` - PM2 configuration that properly loads `.env` from project root
2. ✅ Created `frontend/.env` - Frontend configuration to connect to backend API
3. ✅ Created `start-pm2.sh` and `stop-pm2.sh` - Scripts to build and start/stop everything
4. ✅ Created `logs/` directory - For PM2 log files
5. ✅ Fixed environment variable loading - Backend now correctly loads `.env` variables
6. ✅ Created `run-backend.js` - Backend launcher so backend runs with `python3` on Linux

## One Command Runs BOTH Backend and Frontend

The start script and `ecosystem.config.js` start **both** the backend (Python API) and the frontend (Vite). You should see two PM2 processes: `qamp-backend` and `qamp-frontend`. If only one runs, see [Troubleshooting](#troubleshooting) below.

## Quick Start (3 Easy Steps)

### 1. Make sure you have PM2 installed
```bash
npm install -g pm2
```

### 2. Run the start script
```bash
chmod +x start-pm2.sh stop-pm2.sh
./start-pm2.sh
```

That's it! The script will:
- Build the frontend
- Start **both** backend and frontend with PM2
- Show you the status (you should see `qamp-backend` and `qamp-frontend` online)

### 3. Access your application
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## Important Files

### `.env` (Project Root)

This file contains your API keys and backend configuration. **Must stay here!**

```env
AI_TC_GEN_OPENAI_API_KEY=your-key
AI_TC_GEN_GEMINI_API_KEY=your-key
AI_TC_GEN_DEFAULT_LLM_PROVIDER=ollama
AI_TC_GEN_AUTH_USERNAME=admin
AI_TC_GEN_AUTH_PASSWORD=admin123
# ... more settings
```

### `frontend/.env`

This tells the frontend where to find the backend API:

```env
VITE_API_BASE_URL=http://localhost:8000
```

**Note**: Change this if your backend runs on a different host/port!

## Common Commands

### Check Status
```bash
pm2 status
```

### View Logs
```bash
pm2 logs              # All logs
pm2 logs qamp-backend # Backend only
pm2 logs qamp-frontend # Frontend only
```

### Restart
```bash
pm2 restart all
```

### Stop Everything
```bash
./stop-pm2.sh
```

## Troubleshooting

### Only frontend runs (backend missing or errored)

**Symptom:** `pm2 status` shows only `qamp-frontend` or `qamp-backend` is "errored".

**Cause:** The backend is started via `run-backend.js`, which uses `python3`. If `python3` is not in PATH, the backend fails.

**Fix:**
1. Ensure you have the latest code (with `run-backend.js` in project root).
2. Install Node.js (required to run `run-backend.js`).
3. Restart: `./stop-pm2.sh` then `./start-pm2.sh`.
4. Check backend logs: `pm2 logs qamp-backend --lines 30`.
5. If you see "python not found", install Python 3 and ensure `python3` is in PATH.

### "API is not working" but PM2 status is good

**Check these:**

1. **Is `.env` in the project root?**
   ```bash
   test -f .env && echo "OK" || echo "Missing"
   ```

2. **Does frontend have `.env` with correct API URL?**
   ```bash
   cat frontend/.env
   ```
   Should show: `VITE_API_BASE_URL=http://localhost:8000`

3. **Check backend logs:**
   ```bash
   pm2 logs qamp-backend --lines 50
   ```

4. **Test backend directly:**
   ```bash
   curl http://localhost:8000/api/health
   ```

### Frontend can't connect to backend

1. **Rebuild frontend:**
   ```bash
   cd frontend
   npm run build
   cd ..
   pm2 restart qamp-frontend
   ```

2. **Check frontend .env:**
   Make sure `VITE_API_BASE_URL=http://localhost:8000` is correct

### Port already in use

**Backend (port 8000):**
```bash
sudo lsof -i :8000
sudo kill -9 <PID>
```

**Frontend (port 5173):**
```bash
sudo lsof -i :5173
sudo kill -9 <PID>
```

## Why This Works Now

### Before (Broken):
- PM2 ran backend with `python`; on Linux only `python3` exists, so backend failed and only frontend ran
- Backend couldn't find `.env` in parent directory
- Environment variables weren't loaded
- API keys were missing → API didn't work

### After (Fixed):
- **`run-backend.js`** launcher runs the backend with `python3` on Linux/Mac, so **both** backend and frontend start
- PM2 uses `ecosystem.config.js` to start **both** apps
- Config loads `.env` from project root and passes env to backend
- Backend and frontend both run; API works ✅

## File Structure
```
qamp/
├── .env                      ← Backend environment (MUST BE HERE)
├── run-backend.js            ← Backend launcher (python3)
├── ecosystem.config.js      ← PM2 config: starts BOTH backend + frontend
├── start-pm2.sh              ← Start both
├── stop-pm2.sh               ← Stop both
├── logs/                     ← PM2 logs
├── backend/
│   ├── app/
│   └── ...
└── frontend/
    ├── .env                  ← Frontend API URL
    ├── dist/                 ← Built files
    └── ...
```

## Next Steps

1. **Test it**: Run `./start-pm2.sh` and access http://localhost:5173
2. **Check logs**: Run `pm2 logs` to see if everything is working
3. **Verify API**: Try logging in and generating test cases
4. **Production**: Read `PRODUCTION_DEPLOYMENT.md` or `GOOGLE_CLOUD_DEPLOYMENT.md` for detailed deployment

## Need Help?

Check these files for more information:
- `PRODUCTION_DEPLOYMENT.md` - Detailed deployment guide
- `GOOGLE_CLOUD_DEPLOYMENT.md` - Google Cloud setup
- `README.md` - Project overview
- `DOCUMENTATION.md` - Feature documentation

Or check PM2 logs:
```bash
pm2 logs --lines 100
```
