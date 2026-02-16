#!/bin/bash

# Bash script to start the application with PM2 (Linux/Mac/Google Cloud)

echo -e "\033[0;32mStarting QAMP application with PM2...\033[0m"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "\033[0;31mPM2 is not installed. Please install it with: npm install -g pm2\033[0m"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "\033[0;33mWarning: .env file not found in project root!\033[0m"
    echo -e "\033[0;33mPlease create a .env file based on .env.example\033[0m"
    exit 1
fi

# Frontend port (from .env or default 5173). Export so ecosystem.config.js can use it.
if [ -f ".env" ]; then
  val=$(grep -E '^FRONTEND_PORT=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
  if [ -n "$val" ]; then export FRONTEND_PORT="$val"; fi
fi
export FRONTEND_PORT=${FRONTEND_PORT:-5173}

# Create logs directory if it doesn't exist
if [ ! -d "logs" ]; then
    echo -e "\033[0;36mCreating logs directory...\033[0m"
    mkdir -p logs
fi

# Build the frontend first
echo -e "\033[0;36mBuilding frontend...\033[0m"
cd frontend
npm run build
if [ $? -ne 0 ]; then
    echo -e "\033[0;31mFrontend build failed!\033[0m"
    cd ..
    exit 1
fi
cd ..

# Stop any existing PM2 processes
echo -e "\033[0;36mStopping existing PM2 processes...\033[0m"
pm2 delete ecosystem.config.js 2>/dev/null || true

# Start PM2 with ecosystem config (BOTH backend and frontend)
echo -e "\033[0;36mStarting PM2 processes (backend + frontend)...\033[0m"
pm2 start ecosystem.config.js

# Show status
echo -e "\n\033[0;32mPM2 Status:\033[0m"
pm2 status

# Verify both apps are running
if ! pm2 describe qamp-backend 2>/dev/null | grep -q "status: online"; then
  echo -e "\033[0;33mWarning: Backend (qamp-backend) may not be online. Check: pm2 logs qamp-backend\033[0m"
fi
if ! pm2 describe qamp-frontend 2>/dev/null | grep -q "status: online"; then
  echo -e "\033[0;33mWarning: Frontend (qamp-frontend) may not be online. Check: pm2 logs qamp-frontend\033[0m"
fi

echo -e "\n\033[0;32mApplication started (backend + frontend).\033[0m"
echo -e "\033[0;36mBackend:  http://localhost:8000  (API + /docs)\033[0m"
echo -e "\033[0;36mFrontend: http://localhost:${FRONTEND_PORT}\033[0m"
echo -e "\n\033[0;33mUseful commands:\033[0m"
echo -e "  \033[0;37mpm2 status          - Check application status\033[0m"
echo -e "  \033[0;37mpm2 logs            - View logs\033[0m"
echo -e "  \033[0;37mpm2 restart all     - Restart all processes\033[0m"
echo -e "  \033[0;37mpm2 stop all        - Stop all processes\033[0m"
echo -e "  \033[0;37mpm2 delete all      - Remove all processes\033[0m"
