# Verification Checklist

Use this before and after starting the app (Linux/Mac/Google Cloud).

---

## Pre-flight checks

### 1. Backend environment (`.env`)

```bash
test -f .env && echo "OK" || echo "Missing"
```

If missing: copy `.env.example` to `.env` and set API keys and auth as needed.

Required for typical setups:

- `AI_TC_GEN_OPENAI_API_KEY` (if using OpenAI)
- `AI_TC_GEN_GEMINI_API_KEY` (if using Gemini)
- `AI_TC_GEN_GROQ_API_KEY` (if using Groq)
- `AI_TC_GEN_OLLAMA_BASE_URL` (if using Ollama)
- `AI_TC_GEN_AUTH_USERNAME` and `AI_TC_GEN_AUTH_PASSWORD`

### 2. Frontend environment (`frontend/.env`)

```bash
test -f frontend/.env && echo "OK" || echo "Missing"
```

Should contain at least:

```env
VITE_API_BASE_URL=http://localhost:8000
```

### 3. PM2

```bash
pm2 --version
```

If not installed: `npm install -g pm2`

### 4. Backend dependencies

```bash
test -d backend/app && echo "OK" || echo "Missing"
```

If missing: `cd backend && pip install -r requirements.txt && cd ..`

### 5. Frontend dependencies

```bash
test -d frontend/node_modules && echo "OK" || echo "Missing"
```

If missing: `cd frontend && npm install && cd ..`

### 6. Logs directory

```bash
test -d logs && echo "OK" || echo "Missing"
```

If missing: `mkdir -p logs` (or run `./start-pm2.sh`, which creates it).

### 7. Ecosystem config

```bash
test -f ecosystem.config.js && echo "OK" || echo "Missing"
```

### 8. Ports free

```bash
lsof -i :8000 2>/dev/null || true
lsof -i :5173 2>/dev/null || true
```

No output means ports are free. If in use: `sudo lsof -i :8000` then `sudo kill -9 <PID>` (same for 5173).

### 9. Clean PM2 state (optional)

```bash
pm2 delete qamp-backend 2>/dev/null || true
pm2 delete qamp-frontend 2>/dev/null || true
# or: pm2 delete all
```

### 10. Frontend build

```bash
cd frontend && npm run build && cd ..
test -d frontend/dist && echo "OK" || echo "Missing"
```

---

## Start the application

```bash
chmod +x start-pm2.sh stop-pm2.sh
./start-pm2.sh
```

---

## Post-start verification

### 1. PM2 status

```bash
pm2 status
```

Both `qamp-backend` and `qamp-frontend` should be **online**.

### 2. Logs

```bash
pm2 logs qamp-backend --lines 20 --nostream
pm2 logs qamp-frontend --lines 20 --nostream
```

Backend: FastAPI/Uvicorn on port 8000. Frontend: Vite on port 5173. No errors.

### 3. Health endpoint

```bash
curl http://localhost:8000/api/health
```

Expected: `{"status":"healthy","timestamp":"..."}`

### 4. API docs

Open http://localhost:8000/docs — Swagger UI should load.

### 5. Frontend

Open http://localhost:5173 — login or main UI loads; no console errors (F12).

### 6. Full flow

Log in (if auth enabled), generate a test case, check PM2 logs and browser console for errors.

---

## Success criteria

- All pre-flight checks pass
- Both PM2 processes online
- Health endpoint returns healthy
- API docs load
- Frontend loads and can call API
- No errors in PM2 logs or browser console
