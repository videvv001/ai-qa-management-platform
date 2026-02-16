# Troubleshooting

Common issues and fixes for local development.

---

## Scripts won't run (Linux/macOS)

**Symptom:** `Permission denied` when running a shell script.

**Fix:** Ensure the script is executable: `chmod +x script-name.sh`

---

## Only frontend runs (backend not started)

**Symptom:** Frontend loads but API calls fail (e.g. network error or 404).

**Cause:** Backend is not running, or wrong port. Use `npm run dev` from project root to start both; or run backend and frontend separately.

**Fix:**

1. From project root, run `npm run dev` (starts backend + frontend).
2. Or: in one terminal activate venv, then `cd backend` and `uvicorn app.main:app --reload`. In another terminal: `npm run dev --prefix frontend`.
3. On Windows, if root `npm run dev` fails, use two terminals: backend with `cd backend` then `..\venv\Scripts\python.exe -m uvicorn app.main:app --reload`, and frontend with `npm run dev --prefix frontend`.

---

## API not working

**Checks:**

1. **`.env` in project root**
   ```bash
   test -f .env && echo "OK" || echo "Missing"
   ```
   (Windows: `if (Test-Path .env) { "OK" } else { "Missing" }`)

2. **Frontend API URL**  
   `frontend/.env` can set `VITE_API_BASE_URL=http://localhost:8000`. If missing, Vite proxy is used when using `npm run dev`.

3. **Health endpoint**
   ```bash
   curl http://localhost:8000/api/health
   ```
   Expected: `{"status":"healthy",...}`

4. **Backend running**  
   Backend runs on port 8000. Check terminal where you started it for errors.

---

## Frontend can't connect to backend

1. Confirm backend is running: `curl http://localhost:8000/api/health`.
2. If not using Vite proxy, set `frontend/.env` with `VITE_API_BASE_URL=http://localhost:8000`.
3. Restart frontend dev server after changing `frontend/.env`.

---

## Port already in use

**Find process:**

- **Linux/macOS:** `lsof -i :8000` (backend), `lsof -i :5173` (frontend)
- **Windows:** `netstat -ano | findstr :8000` then `taskkill /PID <pid> /F`

**Kill by PID:** Use your OS command to terminate the process (e.g. `kill -9 <PID>` on Unix, `taskkill /PID <pid> /F` on Windows).

---

## Backend can't find .env

- `.env` must be in the **project root**, not in `backend/`.
- When you run `uvicorn` from `backend/`, the app loads `.env` from the project root (see `backend/app/core/config.py`).

---

## Environment variables not loading

1. `.env` in project root (not in backend or frontend).
2. Variable names use prefix `AI_TC_GEN_` for backend.
3. Restart the backend after changing `.env`.
4. No spaces around `=` in `.env`; quote values if they contain spaces.

---

## Module not found (Python)

```bash
cd backend
pip install -r requirements.txt
cd ..
```

Restart the backend (stop and run `uvicorn` or `npm run dev` again).

---

## Frontend build or dev fails

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

(Windows: remove `node_modules` and `package-lock.json` in Explorer or PowerShell, then `npm install` and `npm run dev`.)

---

## Complete restart (dev)

1. Stop any running backend and frontend (Ctrl+C in their terminals).
2. From project root: `npm run dev`.
3. If ports are still in use, kill the process using port 8000 or 5173 (see “Port already in use” above).
