# Troubleshooting

Common issues and fixes for local development and production (PM2, Linux/Google Cloud).

---

## Scripts won't run

**Symptom:** `Permission denied` when running `./start-pm2.sh`.

**Fix:**

```bash
chmod +x start-pm2.sh stop-pm2.sh
./start-pm2.sh
```

---

## Only frontend runs (backend errored)

**Symptom:** `pm2 status` shows only `qamp-frontend` or `qamp-backend` is "errored".

**Cause:** Backend is started via `run-backend.js` with `python3`. If `python3` is not in PATH, the backend fails.

**Fix:**

1. Ensure `run-backend.js` exists in project root.
2. Install Node.js (required for the launcher).
3. Install Python 3 and ensure `python3` is in PATH.
4. Restart: `./stop-pm2.sh` then `./start-pm2.sh`.
5. Check logs: `pm2 logs qamp-backend --lines 30`.

---

## API not working (PM2 status looks good)

**Checks:**

1. **`.env` in project root**
   ```bash
   test -f .env && echo "OK" || echo "Missing"
   ```

2. **Frontend API URL**
   ```bash
   cat frontend/.env
   ```
   Should show `VITE_API_BASE_URL=http://localhost:8000` (or your backend URL).

3. **Backend logs**
   ```bash
   pm2 logs qamp-backend --lines 50
   ```

4. **Health endpoint**
   ```bash
   curl http://localhost:8000/api/health
   ```
   Expected: `{"status":"healthy",...}`

5. **PM2 environment**
   ```bash
   pm2 env qamp-backend | grep AI_TC_GEN
   ```
   Should list backend env vars. If empty, `.env` is not being loaded (check project root and `ecosystem.config.js`).

---

## Frontend can't connect to backend

1. Confirm `frontend/.env` has the correct `VITE_API_BASE_URL`.
2. Rebuild and restart:
   ```bash
   cd frontend && npm run build && cd ..
   pm2 restart qamp-frontend
   ```
3. Verify backend: `curl http://localhost:8000/api/health`.

---

## Port already in use

**Find process:**

```bash
sudo lsof -i :8000   # backend
sudo lsof -i :5173   # frontend
```

**Kill by PID:**

```bash
sudo kill -9 <PID>
```

---

## Backend can't find .env

- `.env` must be in the **project root**, not in `backend/`.
- PM2 runs the backend via `ecosystem.config.js`, which reads `.env` from the project root and passes variables to the process.
- Check: `ls -la .env` and `pm2 env qamp-backend`.

---

## Environment variables not loading

1. `.env` in project root (not in backend or frontend).
2. Variable names use prefix `AI_TC_GEN_` for backend.
3. Restart PM2: `pm2 restart all`.
4. No spaces around `=` in `.env`; quote values if they contain spaces.

---

## PM2 logs show errors

- **View logs:** `pm2 logs --lines 100`
- **Per process:** `pm2 logs qamp-backend`, `pm2 logs qamp-frontend`
- **File logs:** `logs/backend-error.log`, `logs/frontend-error.log`

Common causes: missing `python3` or Node, missing deps (`pip install -r backend/requirements.txt`, `npm install` in frontend), port in use, or invalid `.env`.

---

## Module not found (Python)

```bash
cd backend
pip install -r requirements.txt
cd ..
pm2 restart qamp-backend
```

---

## Frontend build fails

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
cd ..
pm2 restart qamp-frontend
```

---

## Can't connect from outside (VPS/Google Cloud)

1. **Firewall:** Ensure rules allow 8000, 5173 (or 80/443 if using nginx).
2. **VM tags:** For GCP, instance must have `http-server` (and `https-server` if using HTTPS).
3. **Nginx:** If using proxy, check `sudo systemctl status nginx` and `sudo nginx -t`.
4. **PM2:** `pm2 status` — both processes online.
5. **Logs:** `pm2 logs`.

---

## Complete restart procedure

```bash
pm2 delete all
cd frontend && npm run build && cd ..
./start-pm2.sh
```

If ports are still in use, kill processes with `sudo lsof -i :8000` and `sudo lsof -i :5173`, then `sudo kill -9 <PID>`.
