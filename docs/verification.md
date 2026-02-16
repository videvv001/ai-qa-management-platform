# Verification Checklist

Use this before and after starting the app (local development).

---

## Pre-flight checks

### 1. Backend environment (`.env`)

```bash
test -f .env && echo "OK" || echo "Missing"
```

(Windows PowerShell: `if (Test-Path .env) { "OK" } else { "Missing" }`)

If missing: copy `.env.example` to `.env` and set API keys and auth as needed.

Typical options:

- `AI_TC_GEN_OPENAI_API_KEY` (if using OpenAI)
- `AI_TC_GEN_GEMINI_API_KEY` (if using Gemini)
- `AI_TC_GEN_GROQ_API_KEY` (if using Groq)
- `AI_TC_GEN_OLLAMA_BASE_URL` (if using Ollama)
- `AI_TC_GEN_AUTH_USERNAME` and `AI_TC_GEN_AUTH_PASSWORD`

### 2. Frontend environment (`frontend/.env`)

Optional. If the API is not at `http://localhost:8000`, create `frontend/.env` with:

```env
VITE_API_BASE_URL=http://localhost:8000
```

When using `npm run dev`, the Vite proxy can forward `/api` to the backend without this.

### 3. Backend dependencies

```bash
test -d backend/app && echo "OK" || echo "Missing"
```

If missing: `cd backend && pip install -r requirements.txt && cd ..`

### 4. Frontend dependencies

```bash
test -d frontend/node_modules && echo "OK" || echo "Missing"
```

If missing: `cd frontend && npm install && cd ..`

### 5. Ports free

- **Linux/macOS:** `lsof -i :8000`, `lsof -i :5173` — no output means free.
- **Windows:** `netstat -ano | findstr :8000`, `netstat -ano | findstr :5173`.

If in use, stop the process using that port or kill it (see [troubleshooting](troubleshooting.md)).

---

## Start the application

From project root:

```bash
npm run dev
```

(Linux/macOS: activate venv first, then `npm run dev`. Windows: see [README](../README.md) for PowerShell steps.)

---

## Post-start verification

### 1. Health endpoint

```bash
curl http://localhost:8000/api/health
```

Expected: `{"status":"healthy","timestamp":"..."}`

### 2. API docs

Open http://localhost:8000/docs — Swagger UI should load.

### 3. Frontend

Open http://localhost:5173 — login or main UI loads; no console errors (F12).

### 4. Full flow

Log in (if auth enabled), generate a test case, check terminal and browser console for errors.

---

## Success criteria

- Backend responds on port 8000
- Health endpoint returns healthy
- API docs load
- Frontend loads and can call API
- No errors in terminal or browser console
