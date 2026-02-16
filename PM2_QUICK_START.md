# PM2 Quick Start Guide

## The Problem (Fixed!)

Your `.env` file was in the project root, but when PM2 ran the backend, it couldn't properly load the environment variables, causing the API to not work even though the backend status showed "good".

## What Was Fixed

1. ✅ Created `ecosystem.config.js` - PM2 configuration that properly loads `.env` from project root
2. ✅ Created `frontend/.env` - Frontend configuration to connect to backend API
3. ✅ Created `start-pm2.ps1` - Automated script to build and start everything
4. ✅ Created `stop-pm2.ps1` - Script to cleanly stop all PM2 processes
5. ✅ Created `logs/` directory - For PM2 log files
6. ✅ Fixed environment variable loading - Backend now correctly loads `.env` variables

## Quick Start (3 Easy Steps)

### 1. Make sure you have PM2 installed
```powershell
npm install -g pm2
```

### 2. Run the start script
```powershell
.\start-pm2.ps1
```

That's it! The script will:
- Build the frontend
- Start both backend and frontend with PM2
- Show you the status

### 3. Access your application
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## Important Files

### `.env` (Project Root)
**Location**: `F:\project\tool\newaitool\qamp\.env`

This file contains your API keys and backend configuration. **Must stay here!**

```env
AI_TC_GEN_OPENAI_API_KEY=your-key
AI_TC_GEN_GEMINI_API_KEY=your-key
AI_TC_GEN_DEFAULT_LLM_PROVIDER=ollama
AI_TC_GEN_AUTH_USERNAME=admin
AI_TC_GEN_AUTH_PASSWORD=admin123
# ... more settings
```

### `frontend/.env` (NEW - Created for you)
**Location**: `F:\project\tool\newaitool\qamp\frontend\.env`

This tells the frontend where to find the backend API:

```env
VITE_API_BASE_URL=http://localhost:8000
```

**Note**: Change this if your backend runs on a different host/port!

## Common Commands

### Check Status
```powershell
pm2 status
```

### View Logs
```powershell
pm2 logs              # All logs
pm2 logs qamp-backend # Backend only
pm2 logs qamp-frontend # Frontend only
```

### Restart
```powershell
pm2 restart all
```

### Stop Everything
```powershell
.\stop-pm2.ps1
```

## Troubleshooting

### "API is not working" but PM2 status is good

**Check these:**

1. **Is `.env` in the project root?**
   ```powershell
   Test-Path .\.env
   ```
   Should return `True`

2. **Does frontend have `.env` with correct API URL?**
   ```powershell
   cat frontend\.env
   ```
   Should show: `VITE_API_BASE_URL=http://localhost:8000`

3. **Check backend logs:**
   ```powershell
   pm2 logs qamp-backend --lines 50
   ```

4. **Test backend directly:**
   ```powershell
   curl http://localhost:8000/api/health
   ```

### Frontend can't connect to backend

1. **Rebuild frontend:**
   ```powershell
   cd frontend
   npm run build
   cd ..
   pm2 restart qamp-frontend
   ```

2. **Check frontend .env:**
   Make sure `VITE_API_BASE_URL=http://localhost:8000` is correct

### Port already in use

**Backend (port 8000):**
```powershell
# Find what's using the port
netstat -ano | findstr :8000

# Kill the process (replace PID with the number from above)
taskkill /PID <PID> /F
```

**Frontend (port 5173):**
```powershell
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

## Why This Works Now

### Before (Broken):
- PM2 ran backend from `backend/` directory
- Backend couldn't find `.env` in parent directory
- Environment variables weren't loaded
- API keys were missing → API didn't work

### After (Fixed):
- PM2 uses `ecosystem.config.js` configuration
- Config explicitly loads `.env` from project root
- Environment variables are passed to backend process
- Backend gets all needed configuration
- API works! ✅

## File Structure
```
qamp/
├── .env                      ← Backend environment (MUST BE HERE)
├── ecosystem.config.js       ← PM2 configuration (NEW)
├── start-pm2.ps1            ← Start script (NEW)
├── stop-pm2.ps1             ← Stop script (NEW)
├── logs/                    ← PM2 logs (NEW)
├── backend/
│   ├── app/
│   └── ...
└── frontend/
    ├── .env                 ← Frontend API URL (NEW)
    ├── dist/                ← Built files
    └── ...
```

## Next Steps

1. **Test it**: Run `.\start-pm2.ps1` and access http://localhost:5173
2. **Check logs**: Run `pm2 logs` to see if everything is working
3. **Verify API**: Try logging in and generating test cases
4. **Production**: Read `PRODUCTION_DEPLOYMENT.md` for detailed deployment guide

## Need Help?

Check these files for more information:
- `PRODUCTION_DEPLOYMENT.md` - Detailed deployment guide
- `README.md` - Project overview
- `DOCUMENTATION.md` - Feature documentation

Or check PM2 logs:
```powershell
pm2 logs --lines 100
```
