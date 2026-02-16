# Fix Summary - PM2 Production Build Issue

## Problem Description
You were experiencing issues with your production build where:
- ✗ `.env` file was outside the backend directory (in project root)
- ✗ PM2 backend status showed "good" but API didn't work
- ✗ Frontend couldn't connect to the backend API
- ✗ Environment variables weren't being loaded properly

## Root Cause
When PM2 ran the backend from the `backend/` directory, it couldn't properly locate and load the `.env` file from the parent directory, causing all API keys and configuration to be missing. On Linux, the backend was also started with `python` instead of `python3`, so the backend process failed and only the frontend ran.

## Solutions Implemented

### 1. Created `ecosystem.config.js`
**Purpose**: Proper PM2 configuration that handles environment variables

**Key Features**:
- Loads `.env` file from project root
- Parses environment variables without external dependencies
- Passes all environment variables to backend process
- Configures both backend and frontend processes
- Sets up logging to `logs/` directory
- Uses absolute paths to avoid path resolution issues

### 2. Created `frontend/.env`
**Purpose**: Configure frontend to connect to backend API

**Content**:
```env
VITE_API_BASE_URL=http://localhost:8000
```

**Why needed**: In production (using `npm run preview`), Vite doesn't use the proxy configuration, so the frontend needs to know the backend's full URL.

### 3. Created `run-backend.js`
**Purpose**: Cross-platform backend launcher so the backend starts with `python3` on Linux/Mac (avoids "only frontend runs" when `python` is not in PATH).

### 4. Created `start-pm2.sh`
**Purpose**: Automated startup script (Linux/Mac/Google Cloud)

**What it does**:
1. Checks if PM2 is installed
2. Verifies `.env` file exists
3. Creates `logs/` directory if needed
4. Builds the frontend (`npm run build`)
5. Stops any existing PM2 processes
6. Starts both backend and frontend with PM2
7. Shows status and helpful commands

**Usage**: `./start-pm2.sh`

### 5. Created `stop-pm2.sh`
**Purpose**: Clean shutdown script

**What it does**: Stops and removes all PM2 processes for this project

**Usage**: `./stop-pm2.sh`

### 6. Created `logs/` directory
**Purpose**: Store PM2 log files

**Contents**:
- `backend-error.log` - Backend error output
- `backend-out.log` - Backend standard output
- `frontend-error.log` - Frontend error output
- `frontend-out.log` - Frontend standard output

### 7. Created Documentation
**Files created**:
- `PM2_QUICK_START.md` - Quick reference guide (START HERE)
- `PRODUCTION_DEPLOYMENT.md` - Detailed deployment guide
- `GOOGLE_CLOUD_DEPLOYMENT.md` - Google Cloud setup
- `FIX_SUMMARY.md` - This file

## How It Works Now

### Environment Variable Flow:

```
1. .env (project root)
   ↓
2. ecosystem.config.js reads and parses .env
   ↓
3. PM2 loads environment variables
   ↓
4. Backend process receives all variables
   ↓
5. backend/app/core/config.py uses pydantic-settings
   ↓
6. Configuration is available to all backend code
```

### Process Flow:

```
./start-pm2.sh
  ↓
Builds frontend → dist/
  ↓
PM2 starts ecosystem.config.js
  ├─→ qamp-backend (via run-backend.js, python3)
  │   - Receives environment variables from .env
  │   - Starts FastAPI on port 8000
  │   - Logs to logs/backend-*.log
  │
  └─→ qamp-frontend (runs from frontend/ directory)
      - Serves built files from dist/
      - Uses VITE_API_BASE_URL from frontend/.env
      - Starts preview server on port 5173
      - Logs to logs/frontend-*.log
```

## File Changes Summary

### New Files Created:
```
✨ ecosystem.config.js              - PM2 configuration
✨ frontend/.env                    - Frontend API URL config
✨ run-backend.js                   - Backend launcher (python3)
✨ start-pm2.sh                     - Start script
✨ stop-pm2.sh                      - Stop script
✨ logs/                            - Log directory
✨ PM2_QUICK_START.md               - Quick start guide
✨ PRODUCTION_DEPLOYMENT.md         - Detailed guide
✨ GOOGLE_CLOUD_DEPLOYMENT.md       - Google Cloud guide
✨ FIX_SUMMARY.md                   - This file
```

### Existing Files Modified:
```
None - All existing code remains unchanged!
```

## Testing the Fix

### Step 1: Install PM2 (if not already installed)
```bash
npm install -g pm2
```

### Step 2: Stop any existing processes
```bash
# Stop PM2 processes (if any)
pm2 delete all

# Kill any processes on port 8000
sudo lsof -i :8000
# If found, kill with: sudo kill -9 <PID>

# Kill any processes on port 5173
sudo lsof -i :5173
# If found, kill with: sudo kill -9 <PID>
```

### Step 3: Run the start script
```bash
chmod +x start-pm2.sh stop-pm2.sh
./start-pm2.sh
```

### Step 4: Verify it's working
```bash
# Check PM2 status
pm2 status

# Check backend logs
pm2 logs qamp-backend --lines 20

# Check frontend logs
pm2 logs qamp-frontend --lines 20

# Test backend health endpoint
curl http://localhost:8000/api/health

# Access frontend in browser
# Open http://localhost:5173
```

## Expected Results

### PM2 Status:
```
┌─────┬───────────────────┬─────────┬─────────┬────────┐
│ id  │ name              │ status  │ restart │ cpu    │
├─────┼───────────────────┼─────────┼─────────┼────────┤
│ 0   │ qamp-backend      │ online  │ 0       │ 0%     │
│ 1   │ qamp-frontend     │ online  │ 0       │ 0%     │
└─────┴───────────────────┴─────────┴─────────┴────────┘
```

### Backend Health Check:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-16T..."
}
```

### Frontend:
- Should load at http://localhost:5173
- Should be able to log in with credentials from `.env`
- Should be able to generate test cases
- API calls should work without errors

## Troubleshooting

### If backend logs show "API key not found":
1. Check `.env` exists in project root: `test -f .env`
2. Check `.env` has the required keys
3. Restart PM2: `pm2 restart qamp-backend`

### If frontend can't connect to backend:
1. Check `frontend/.env` has correct URL
2. Rebuild frontend: `cd frontend && npm run build && cd ..`
3. Restart: `pm2 restart qamp-frontend`

### If PM2 shows "errored" status:
1. Check logs: `pm2 logs --lines 50`
2. Check if Python 3 / Node is in PATH
3. Check if required dependencies are installed

## Configuration Options

### Change Backend Port
Edit `run-backend.js` (uvicorn port) and `frontend/.env`:
```env
VITE_API_BASE_URL=http://localhost:8080
```

### Change Frontend Port
Edit `frontend/vite.config.ts`:
```typescript
server: {
  port: 3000,  // Change this
  // ...
}
```

### Use Different LLM Provider
Edit `.env` in project root:
```env
AI_TC_GEN_DEFAULT_LLM_PROVIDER=openai  # or ollama, gemini, groq
```

## Security Checklist for Production

- [ ] Change `AI_TC_GEN_AUTH_USERNAME` and `AI_TC_GEN_AUTH_PASSWORD`
- [ ] Set strong `AI_TC_GEN_JWT_SECRET` (generate with: `openssl rand -hex 32`)
- [ ] Don't commit `.env` to git (already in `.gitignore`)
- [ ] Don't commit `frontend/.env` if it contains sensitive URLs
- [ ] Use HTTPS in production (nginx/Apache reverse proxy)
- [ ] Restrict `.env` file permissions: `chmod 600 .env`
- [ ] Set up firewall rules if needed
- [ ] Consider using PM2 startup script: `pm2 startup && pm2 save`

## What's Next?

1. **Test the application**: Run `./start-pm2.sh` and test all features
2. **Monitor logs**: Use `pm2 logs` to watch for any errors
3. **Set up auto-start**: Use `pm2 startup` and `pm2 save` for automatic restart on reboot
4. **Configure reverse proxy**: Set up nginx/Apache for production (see `PRODUCTION_DEPLOYMENT.md`)
5. **Set up monitoring**: Consider PM2 Plus for advanced monitoring

## Quick Command Reference

```bash
# Start application
./start-pm2.sh

# Stop application
./stop-pm2.sh

# Check status
pm2 status

# View logs
pm2 logs
pm2 logs qamp-backend
pm2 logs qamp-frontend

# Restart
pm2 restart all
pm2 restart qamp-backend
pm2 restart qamp-frontend

# Monitor
pm2 monit

# Save for auto-start
pm2 save

# Set up auto-start on boot
pm2 startup
```

## Summary

The fix ensures that:
✅ Environment variables are properly loaded from `.env` in project root
✅ Backend receives all configuration (API keys, auth settings, etc.)
✅ Frontend knows where to find the backend API
✅ PM2 manages both processes with proper logging
✅ Backend runs via `run-backend.js` with `python3` on Linux
✅ Easy start/stop scripts (bash) for Linux/Mac/Google Cloud
✅ All logs are captured in one place
✅ No code changes needed - just configuration!

Your production build should now work correctly! 🎉
