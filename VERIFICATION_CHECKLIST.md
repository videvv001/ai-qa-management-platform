# Verification Checklist - Before Starting PM2

Run through this checklist before starting the application to ensure everything is configured correctly.

## Pre-Flight Checks

### 1. Environment File (`.env`)
```powershell
# Check if .env exists in project root
Test-Path .\.env
```
**Expected**: `True`

**If False**: Copy `.env.example` to `.env` and fill in your values

```powershell
# View .env contents (verify it has your API keys)
cat .\.env
```

**Must contain**:
- `AI_TC_GEN_OPENAI_API_KEY` (if using OpenAI)
- `AI_TC_GEN_GEMINI_API_KEY` (if using Gemini)
- `AI_TC_GEN_GROQ_API_KEY` (if using Groq)
- `AI_TC_GEN_OLLAMA_BASE_URL` (if using Ollama)
- `AI_TC_GEN_AUTH_USERNAME`
- `AI_TC_GEN_AUTH_PASSWORD`

### 2. Frontend Environment File
```powershell
# Check if frontend/.env exists
Test-Path .\frontend\.env
```
**Expected**: `True`

```powershell
# View frontend/.env contents
cat .\frontend\.env
```

**Must contain**:
```env
VITE_API_BASE_URL=http://localhost:8000
```

**If different backend URL**: Update accordingly

### 3. PM2 Installation
```powershell
# Check if PM2 is installed
pm2 --version
```
**Expected**: Version number (e.g., `5.x.x`)

**If not installed**:
```powershell
npm install -g pm2
```

### 4. Backend Dependencies
```powershell
# Check if backend dependencies are installed
Test-Path .\backend\app\
```
**Expected**: `True`

```powershell
# Install/update backend dependencies
cd backend
pip install -r requirements.txt
cd ..
```

### 5. Frontend Dependencies
```powershell
# Check if frontend dependencies are installed
Test-Path .\frontend\node_modules\
```
**Expected**: `True`

**If False**:
```powershell
cd frontend
npm install
cd ..
```

### 6. Logs Directory
```powershell
# Check if logs directory exists
Test-Path .\logs\
```
**Expected**: `True`

**If False** (shouldn't happen, start-pm2.ps1 creates it):
```powershell
New-Item -ItemType Directory -Path logs
```

### 7. Ecosystem Configuration
```powershell
# Check if ecosystem.config.js exists
Test-Path .\ecosystem.config.js
```
**Expected**: `True`

### 8. Port Availability

**Check if ports are free**:
```powershell
# Check port 8000 (backend)
netstat -ano | findstr :8000

# Check port 5173 (frontend)
netstat -ano | findstr :5173
```

**Expected**: No output (ports are free)

**If ports are in use**:
```powershell
# Kill process on port 8000
$pid = (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue).OwningProcess
if ($pid) { taskkill /PID $pid /F }

# Kill process on port 5173
$pid = (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue).OwningProcess
if ($pid) { taskkill /PID $pid /F }
```

### 9. Stop Existing PM2 Processes
```powershell
# Stop any existing PM2 processes for this project
pm2 delete qamp-backend 2>$null
pm2 delete qamp-frontend 2>$null

# Or stop all PM2 processes
pm2 delete all
```

### 10. Build Frontend
```powershell
# Build the frontend
cd frontend
npm run build
cd ..
```

**Expected**: No errors, `dist/` directory created in `frontend/`

```powershell
# Verify build
Test-Path .\frontend\dist\
```
**Expected**: `True`

## All Checks Passed? Start the Application!

```powershell
.\start-pm2.ps1
```

## Post-Start Verification

### 1. Check PM2 Status
```powershell
pm2 status
```

**Expected**:
```
┌─────┬───────────────────┬─────────┬─────────┐
│ id  │ name              │ status  │ restart │
├─────┼───────────────────┼─────────┼─────────┤
│ 0   │ qamp-backend      │ online  │ 0       │
│ 1   │ qamp-frontend     │ online  │ 0       │
└─────┴───────────────────┴─────────┴─────────┘
```

**Status should be**: `online` for both

**If status is `errored`**: Check logs (see step 2)

### 2. Check Logs
```powershell
# View last 20 lines of each log
pm2 logs qamp-backend --lines 20 --nostream
pm2 logs qamp-frontend --lines 20 --nostream
```

**Backend should show**:
- FastAPI starting up
- Uvicorn running on port 8000
- No error messages

**Frontend should show**:
- Vite preview server starting
- Running on port 5173
- No error messages

### 3. Test Backend Health Endpoint
```powershell
# Test backend API
curl http://localhost:8000/api/health
```

**Expected**:
```json
{"status":"healthy","timestamp":"..."}
```

**If error**: Check backend logs

### 4. Test Backend API Documentation
```powershell
# Open API docs in browser
start http://localhost:8000/docs
```

**Expected**: Swagger UI page loads showing all API endpoints

### 5. Test Frontend
```powershell
# Open frontend in browser
start http://localhost:5173
```

**Expected**: 
- Login page loads
- No console errors (press F12 to check)
- Can log in with credentials from `.env`

### 6. Test API Connection

1. Log in with credentials from `.env`
2. Try generating a test case
3. Check browser console (F12) for errors
4. Check PM2 logs: `pm2 logs`

**Expected**:
- No errors in browser console
- API calls succeed
- Test cases are generated

## Troubleshooting

### Backend Status: "errored"

**Check logs**:
```powershell
pm2 logs qamp-backend --lines 50
```

**Common issues**:
- Python not found → Add Python to PATH
- Module not found → Run `pip install -r backend/requirements.txt`
- Port already in use → Kill process on port 8000

### Frontend Status: "errored"

**Check logs**:
```powershell
pm2 logs qamp-frontend --lines 50
```

**Common issues**:
- Node/npm not found → Add Node to PATH
- dist/ folder missing → Run `cd frontend && npm run build && cd ..`
- Port already in use → Kill process on port 5173

### Backend "online" but API doesn't work

**Check**:
1. Environment variables loaded?
   ```powershell
   pm2 env qamp-backend
   ```
   Should show all `AI_TC_GEN_*` variables

2. Test health endpoint:
   ```powershell
   curl http://localhost:8000/api/health
   ```

3. Check backend logs:
   ```powershell
   pm2 logs qamp-backend --lines 50
   ```

### Frontend loads but can't connect to backend

**Check**:
1. `frontend/.env` has correct URL:
   ```powershell
   cat frontend\.env
   ```
   Should show: `VITE_API_BASE_URL=http://localhost:8000`

2. Backend is running:
   ```powershell
   curl http://localhost:8000/api/health
   ```

3. Rebuild frontend if `.env` was changed:
   ```powershell
   cd frontend
   npm run build
   cd ..
   pm2 restart qamp-frontend
   ```

### "Can't find module" errors

**Backend**:
```powershell
cd backend
pip install -r requirements.txt
cd ..
pm2 restart qamp-backend
```

**Frontend**:
```powershell
cd frontend
npm install
npm run build
cd ..
pm2 restart qamp-frontend
```

## Quick Fix Commands

```powershell
# Complete restart procedure
pm2 delete all
cd frontend
npm run build
cd ..
.\start-pm2.ps1

# View all logs
pm2 logs

# Restart specific process
pm2 restart qamp-backend
pm2 restart qamp-frontend

# Check what's using a port
netstat -ano | findstr :8000
netstat -ano | findstr :5173

# Kill a process by PID
taskkill /PID <PID> /F
```

## Success Criteria

✅ All pre-flight checks pass
✅ PM2 shows both processes as "online"
✅ Backend health endpoint responds
✅ API docs page loads
✅ Frontend page loads
✅ Can log in successfully
✅ Can generate test cases
✅ No errors in browser console
✅ No errors in PM2 logs

## If All Else Fails

1. **Stop everything**:
   ```powershell
   pm2 delete all
   ```

2. **Clean ports**:
   ```powershell
   # Kill port 8000
   $pid = (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue).OwningProcess
   if ($pid) { taskkill /PID $pid /F }
   
   # Kill port 5173
   $pid = (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue).OwningProcess
   if ($pid) { taskkill /PID $pid /F }
   ```

3. **Reinstall dependencies**:
   ```powershell
   # Backend
   cd backend
   pip install --upgrade -r requirements.txt
   cd ..
   
   # Frontend
   cd frontend
   Remove-Item -Recurse -Force node_modules
   npm install
   npm run build
   cd ..
   ```

4. **Start fresh**:
   ```powershell
   .\start-pm2.ps1
   ```

5. **Check logs in detail**:
   ```powershell
   pm2 logs --lines 100
   ```

## Need More Help?

Refer to these files:
- `PM2_QUICK_START.md` - Quick start guide
- `PRODUCTION_DEPLOYMENT.md` - Detailed deployment guide
- `FIX_SUMMARY.md` - What was fixed and why
