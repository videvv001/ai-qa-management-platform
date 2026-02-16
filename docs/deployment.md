# Deployment Guide

One start command runs **both** backend and frontend. You should see two PM2 processes: `qamp-backend` and `qamp-frontend`.

---

## 1. Local (same machine)

### Prerequisites

- Node.js 18+
- Python 3.8+
- PM2: `npm install -g pm2`

### Steps

1. **Environment** — Create `.env` in project root and `frontend/.env` (see [Environment variables](#5-environment-variables)).
2. **Dependencies:**
   ```bash
   cd backend && pip install -r requirements.txt && cd ..
   cd frontend && npm install && cd ..
   ```
3. **Start:**
   ```bash
   chmod +x start-pm2.sh stop-pm2.sh
   ./start-pm2.sh
   ```
4. **Access:** Frontend http://localhost:5173 | Backend http://localhost:8000 | API docs http://localhost:8000/docs

### npm scripts

```bash
npm run pm2:build-start   # Build frontend + start both
npm run pm2:start        # Start both (assumes already built)
npm run pm2:status
npm run pm2:logs
npm run pm2:restart
npm run pm2:stop
```

---

## 2. VPS / Google Cloud (Linux)

### 2.1 Create VM (Google Cloud example)

```bash
gcloud compute instances create qamp-server \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --tags=http-server,https-server
```

### 2.2 Install dependencies on VM

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs python3.11 python3.11-venv python3-pip git
sudo npm install -g pm2
```

### 2.3 Clone and configure

```bash
git clone https://github.com/your-username/qamp.git
cd qamp
```

Create `.env` in project root and `frontend/.env`. For frontend, use your server IP or domain:

```env
# frontend/.env (with nginx or direct access)
VITE_API_BASE_URL=http://YOUR_SERVER_IP:8000
```

### 2.4 Install app dependencies and start

```bash
cd backend && python3 -m pip install -r requirements.txt && cd ..
cd frontend && npm install && cd ..
chmod +x start-pm2.sh stop-pm2.sh
./start-pm2.sh
```

### 2.5 Start on boot

```bash
pm2 startup
# Run the command it outputs (e.g. sudo env PATH=...)
pm2 save
```

### 2.6 Firewall (Google Cloud)

```bash
gcloud compute firewall-rules create allow-qamp-backend --allow tcp:8000 --target-tags=http-server
gcloud compute firewall-rules create allow-qamp-frontend --allow tcp:5173 --target-tags=http-server
```

---

## 3. Production with PM2

### File layout

```
qamp/
├── .env                 # Backend config (project root)
├── run-backend.js       # Backend launcher (python3)
├── ecosystem.config.js  # PM2: backend + frontend
├── start-pm2.sh
├── stop-pm2.sh
├── logs/
├── backend/
└── frontend/
    ├── .env             # VITE_API_BASE_URL
    └── dist/            # Built assets
```

### Commands

| Action   | Command                    |
|----------|----------------------------|
| Start    | `./start-pm2.sh`           |
| Stop     | `./stop-pm2.sh`            |
| Status   | `pm2 status`              |
| Logs     | `pm2 logs`                |
| Restart  | `pm2 restart all`         |
| Monitor  | `pm2 monit`               |

### Update app

```bash
./stop-pm2.sh
git pull
cd backend && pip install -r requirements.txt && cd ..
cd frontend && npm install && npm run build && cd ..
./start-pm2.sh
```

---

## 4. HTTPS (nginx + Let's Encrypt)

### 4.1 Nginx reverse proxy

Install and add a site (e.g. `/etc/nginx/sites-available/qamp`):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /docs {
        proxy_pass http://localhost:8000/docs;
        proxy_set_header Host $host;
    }

    location /openapi.json {
        proxy_pass http://localhost:8000/openapi.json;
        proxy_set_header Host $host;
    }
}
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/qamp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Set `frontend/.env` to use relative URLs:

```env
VITE_API_BASE_URL=
```

Rebuild and restart frontend:

```bash
cd frontend && npm run build && cd ..
pm2 restart qamp-frontend
```

### 4.2 SSL with Let's Encrypt

Requires a domain pointing to the server.

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Then set `VITE_API_BASE_URL=https://your-domain.com`, rebuild frontend, and restart `qamp-frontend`.

---

## 5. Environment variables

### Backend (`.env` in project root)

| Variable | Description |
|----------|-------------|
| `AI_TC_GEN_OPENAI_API_KEY` | OpenAI API key (optional) |
| `AI_TC_GEN_GEMINI_API_KEY` | Gemini API key (optional) |
| `AI_TC_GEN_GROQ_API_KEY` | Groq API key (optional) |
| `AI_TC_GEN_DEFAULT_LLM_PROVIDER` | `ollama`, `openai`, `gemini`, or `groq` |
| `AI_TC_GEN_OLLAMA_BASE_URL` | Ollama API URL (default `http://localhost:11434`) |
| `AI_TC_GEN_OLLAMA_MODEL` | Ollama model (e.g. `llama3.2:3b`) |
| `AI_TC_GEN_AUTH_USERNAME` | Basic auth username (when auth enabled) |
| `AI_TC_GEN_AUTH_PASSWORD` | Basic auth password |
| `AI_TC_GEN_JWT_SECRET` | JWT secret (set in production) |

### Frontend (`frontend/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend URL (e.g. `http://localhost:8000`). Empty when using nginx proxy. |

Backend loads `.env` from the **project root**. The backend is started via `run-backend.js` (using `python3`) so both processes start correctly on Linux.
