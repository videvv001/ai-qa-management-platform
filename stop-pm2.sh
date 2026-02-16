#!/bin/bash

# Bash script to stop PM2 processes (Linux/Mac/Google Cloud)

echo -e "\033[0;33mStopping QAMP application...\033[0m"

pm2 delete ecosystem.config.js 2>/dev/null || pm2 delete all

echo -e "\033[0;32mApplication stopped successfully!\033[0m"
