# Verification Checklist - Before Starting PM2

Run through this checklist before starting the application to ensure everything is configured correctly (Linux/Mac/Google Cloud).

## Pre-Flight Checks

### 1. Environment File (`.env`)
```bash
# Check if .env exists in project root
test -f .env && echo "OK" || echo "Missing"
```

**Expected**: `OK`

**If Missing**: Copy `.env.example` to `.env` and fill in your values

```bash
# View .env contents (verify it has your API keys)
cat .env
```

**Must contain**:
- `AI_TC_GEN_OPENAI_API_KEY` (if using OpenAI)
- `AI_TC_GEN_GEMINI_API_KEY` (if using Gemini)
- `AI_TC_GEN_GROQ_API_KEY` (if using Groq)
- `AI_TC_GEN_OLLAMA_BASE_URL` (if using Ollama)
- `AI_TC_GEN_AUTH_USERNAME`
- `AI_TC_GEN_AUTH_PASSWORD`

### 2. Frontend Environment File
```bash
# Check if frontend/.env exists
test -f frontend/.env && echo "OK" || echo "Missing"
```
**Expected**: `OK`

```bash
# View frontend/.env contents
cat frontend/.env
```

**Must contain**:
```env
VITE_API_BASE_URL=http://localhost:8000
```

**If different backend URL**: Update accordingly

### 3. PM2 Installation
```bash
# Check if PM2 is installed
pm2 --version
```
**Expected**: Version number (e.g., `5.x.x`)

**If not installed**:
```bash
npm install -g pm2
```

### 4. Backend Dependencies
```bash
# Check if backend dependencies are installed
test -d backend/app && echo "OK" || echo "Missing"
```
**Expected**: `OK`

```bash
# Install/update backend dependencies
cd backend
pip install -r requirements.txt
cd ..
```

### 5. Frontend Dependencies
```bash
# Check if frontend dependencies are installed
test -d frontend/node_modules && echo "OK" || echo "Missing"
```
**Expected**: `OK`

**If Missing**:
```bash
cd frontend
npm install
cd ..
```

### 6. Logs Directory
```bash
# Check if logs directory exists
test -d logs && echo "OK" || echo "Missing"
```
**Expected**: `OK`

**If Missing** (start-pm2.sh creates it, or create manually):
```bash
mkdir -p logs
```

### 7. Ecosystem Configuration
```bash
# Check if ecosystem.config.js exists
test -f ecosystem.config.js && echo "OK" || echo "Missing"
```
**Expected**: `OK`

### 8. Port Availability

**Check if ports are free**:
```bash
# Check port 8000 (backend)
lsof -i :8000 2>/dev/null || true

# Check port 5173 (frontend)
lsof -i :5173 2>/dev/null || true
```

**Expected**: No output (ports are free)

**If ports are in use**:
```bash
# Find and kill process on port 8000
sudo lsof -i :8000
sudo kill -9 <PID>

# Find and kill process on port 5173
sudo lsof -i :5173
sudo kill -9 <PID>
```

### 9. Stop Existing PM2 Processes
```bash
# Stop any existing PM2 processes for this project
pm2 delete qamp-backend 2>/dev/null || true
pm2 delete qamp-frontend 2>/dev/null || true

# Or stop all PM2 processes
pm2 delete all
```

### 10. Build Frontend
```bash
# Build the frontend
cd frontend
npm run build
cd ..
```

**Expected**: No errors, `dist/` directory created in `frontend/`

```bash
# Verify build
test -d frontend/dist && echo "OK" || echo "Missing"
```
**Expected**: `OK`

## All Checks Passed? Start the Application!

```bash
chmod +x start-pm2.sh stop-pm2.sh
./start-pm2.sh
```

## Post-Start Verification

### 1. Check PM2 Status
```bash
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
```bash
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
```bash
# Test backend API
curl http://localhost:8000/api/health
```

**Expected**:
```json
{"status":"healthy","timestamp":"..."}
```

**If error**: Check backend logs

### 4. Test Backend API Documentation

Open in browser: http://localhost:8000/docs

**Expected**: Swagger UI page loads showing all API endpoints

### 5. Test Frontend

Open in browser: http://localhost:5173

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
```bash
pm2 logs qamp-backend --lines 50
```

**Common issues**:
- Python not found → Install Python 3, ensure `python3` is in PATH
- Module not found → Run `pip install -r backend/requirements.txt`
- Port already in use → Kill process on port 8000

### Frontend Status: "errored"

**Check logs**:
```bash
pm2 logs qamp-frontend --lines 50
```

**Common issues**:
- Node/npm not found → Add Node to PATH
- dist/ folder missing → Run `cd frontend && npm run build && cd ..`
- Port already in use → Kill process on port 5173

### Backend "online" but API doesn't work

**Check**:
1. Environment variables loaded?
   ```bash
   pm2 env qamp-backend
   ```
   Should show all `AI_TC_GEN_*` variables

2. Test health endpoint:
   ```bash
   curl http://localhost:8000/api/health
   ```

3. Check backend logs:
   ```bash
   pm2 logs qamp-backend --lines 50
   ```

### Frontend loads but can't connect to backend

**Check**:
1. `frontend/.env` has correct URL:
   ```bash
   cat frontend/.env
   ```
   Should show: `VITE_API_BASE_URL=http://localhost:8000`

2. Backend is running:
   ```bash
   curl http://localhost:8000/api/health
   ```

3. Rebuild frontend if `.env` was changed:
   ```bash
   cd frontend
   npm run build
   cd ..
   pm2 restart qamp-frontend
   ```

### "Can't find module" errors

**Backend**:
```bash
cd backend
pip install -r requirements.txt
cd ..
pm2 restart qamp-backend
```

**Frontend**:
```bash
cd frontend
npm install
npm run build
cd ..
pm2 restart qamp-frontend
```

## Quick Fix Commands

```bash
# Complete restart procedure
pm2 delete all
cd frontend
npm run build
cd ..
./start-pm2.sh

# View all logs
pm2 logs

# Restart specific process
pm2 restart qamp-backend
pm2 restart qamp-frontend

# Check what's using a port
sudo lsof -i :8000
sudo lsof -i :5173

# Kill a process by PID
sudo kill -9 <PID>
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
   ```bash
   pm2 delete all
   ```

2. **Clean ports**:
   ```bash
   # Kill port 8000
   sudo lsof -i :8000
   sudo kill -9 <PID>
   
   # Kill port 5173
   sudo lsof -i :5173
   sudo kill -9 <PID>
   ```

3. **Reinstall dependencies**:
   ```bash
   # Backend
   cd backend
   pip install --upgrade -r requirements.txt
   cd ..
   
   # Frontend
   cd frontend
   rm -rf node_modules
   npm install
   npm run build
   cd ..
   ```

4. **Start fresh**:
   ```bash
   ./start-pm2.sh
   ```

5. **Check logs in detail**:
   ```bash
   pm2 logs --lines 100
   ```

## Need More Help?

Refer to these files:
- `PM2_QUICK_START.md` - Quick start guide
- `PRODUCTION_DEPLOYMENT.md` - Detailed deployment guide
- `GOOGLE_CLOUD_DEPLOYMENT.md` - Google Cloud setup
- `FIX_SUMMARY.md` - What was fixed and why
