# Production Deployment Guide

This guide explains how to deploy QAMP in production using PM2 (Linux/Mac/Google Cloud).

**One start command runs BOTH backend and frontend.** After starting, you should see two PM2 processes: `qamp-backend` and `qamp-frontend`. The backend is started via `run-backend.js` (using `python3`).

## Prerequisites

1. **Node.js and npm** installed
2. **Python 3.8+** with pip
3. **PM2** installed globally:
   ```bash
   npm install -g pm2
   ```

## Setup Steps

### 1. Install Dependencies

#### Backend
```bash
cd backend
pip install -r requirements.txt
cd ..
```

#### Frontend
```bash
cd frontend
npm install
cd ..
```

### 2. Configure Environment Variables

Make sure your `.env` file is in the **project root** (not in backend or frontend folders).

The `.env` file should contain your API keys and configuration:

```env
# OpenAI Configuration
AI_TC_GEN_OPENAI_API_KEY=your-key-here

# Gemini Configuration
AI_TC_GEN_GEMINI_API_KEY=your-key-here

# Groq Configuration
AI_TC_GEN_GROQ_API_KEY=your-key-here

# LLM Provider Settings
AI_TC_GEN_DEFAULT_LLM_PROVIDER=ollama
AI_TC_GEN_OLLAMA_BASE_URL=http://localhost:11434
AI_TC_GEN_OLLAMA_MODEL=llama3.2:3b

# Authentication
AI_TC_GEN_AUTH_USERNAME=admin
AI_TC_GEN_AUTH_PASSWORD=your-secure-password
AI_TC_GEN_JWT_SECRET=your-secret-key-here
```

### 3. Configure Frontend API Endpoint

Edit `frontend/.env` to point to your backend:

```env
VITE_API_BASE_URL=http://localhost:8000
```

For production with a different host, update it accordingly:
```env
VITE_API_BASE_URL=https://your-backend-domain.com
```

### 4. Build Frontend

```bash
cd frontend
npm run build
cd ..
```

### 5. Start Application with PM2

#### Option 1: Use the provided script
```bash
chmod +x start-pm2.sh stop-pm2.sh
./start-pm2.sh
```

#### Option 2: Manual PM2 start
```bash
pm2 start ecosystem.config.js
```

### 6. Verify Deployment

Check PM2 status:
```bash
pm2 status
```

You should see two processes running:
- `qamp-backend` - Backend API server
- `qamp-frontend` - Frontend server

### 7. Access the Application

- **Backend API**: http://localhost:8000
- **Frontend**: http://localhost:5173
- **API Documentation**: http://localhost:8000/docs

## PM2 Management Commands

### View Status
```bash
pm2 status
```

### View Logs
```bash
# All logs
pm2 logs

# Backend only
pm2 logs qamp-backend

# Frontend only
pm2 logs qamp-frontend
```

### Restart Application
```bash
# Restart all
pm2 restart all

# Restart specific process
pm2 restart qamp-backend
pm2 restart qamp-frontend
```

### Stop Application
```bash
# Use the provided script
./stop-pm2.sh

# Or manually
pm2 stop all
pm2 delete all
```

### Monitor Application
```bash
pm2 monit
```

### Save PM2 Process List
To auto-start PM2 processes on system reboot:
```bash
pm2 save
pm2 startup
```

## Troubleshooting

### Backend Can't Find .env File

**Problem**: Backend status shows "good" but API doesn't work.

**Solution**: 
1. Verify `.env` file exists in project root (not in backend folder)
2. Check PM2 logs: `pm2 logs qamp-backend`
3. Verify environment variables are loaded:
   ```bash
   pm2 env qamp-backend
   ```

### Frontend Can't Connect to Backend

**Problem**: Frontend loads but API calls fail.

**Solution**:
1. Check `frontend/.env` has correct `VITE_API_BASE_URL`
2. Rebuild frontend: `cd frontend && npm run build && cd ..`
3. Restart PM2: `pm2 restart all`

### Port Already in Use

**Problem**: Backend or frontend can't start due to port conflict.

**Solution**:
1. Check what's using the port:
   ```bash
   sudo lsof -i :8000   # Backend
   sudo lsof -i :5173   # Frontend
   ```
2. Kill the process or change the port in `ecosystem.config.js`

### PM2 Logs Show Errors

**Problem**: Application crashes or shows errors.

**Solution**:
1. View detailed logs: `pm2 logs --lines 100`
2. Check log files in the `logs/` directory:
   - `logs/backend-error.log`
   - `logs/frontend-error.log`

## File Structure

```
qamp/
├── .env                    # Main environment variables (MUST BE HERE)
├── run-backend.js          # Backend launcher
├── ecosystem.config.js     # PM2 configuration
├── start-pm2.sh             # Start script
├── stop-pm2.sh             # Stop script
├── logs/                   # PM2 log files
│   ├── backend-error.log
│   ├── backend-out.log
│   ├── frontend-error.log
│   └── frontend-out.log
├── backend/
│   ├── app/
│   └── requirements.txt
└── frontend/
    ├── .env                # Frontend environment variables
    ├── dist/                # Built frontend files
    └── package.json
```

## Production Checklist

- [ ] `.env` file is in project root with all required variables
- [ ] `AI_TC_GEN_JWT_SECRET` is set to a secure random string
- [ ] `AI_TC_GEN_AUTH_PASSWORD` is changed from default
- [ ] Frontend `.env` has correct `VITE_API_BASE_URL`
- [ ] Frontend is built with `npm run build`
- [ ] Backend dependencies installed (`pip install -r requirements.txt`)
- [ ] Frontend dependencies installed (`npm install`)
- [ ] PM2 is installed globally (`npm install -g pm2`)
- [ ] Firewall allows connections on ports 8000 and 5173
- [ ] PM2 processes are saved (`pm2 save`) for auto-restart

## Security Notes

1. **Change default credentials** in `.env`
2. Use **strong JWT secret** for production
3. Consider using **HTTPS** with a reverse proxy (nginx/Apache)
4. **Restrict access** to the `.env` file (contains sensitive API keys)
5. Set up **firewall rules** to limit external access if needed

## Additional Configuration

### Running on Different Ports

Edit `ecosystem.config.js` and in `run-backend.js` (or the uvicorn args) change the port. For frontend, edit `vite.config.ts` server.port.

### Using Reverse Proxy (nginx)

For production, it's recommended to use nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then update `frontend/.env`:
```env
VITE_API_BASE_URL=
```
(Empty string uses relative URLs)
