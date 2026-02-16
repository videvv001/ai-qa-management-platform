# PowerShell script to stop PM2 processes

Write-Host "Stopping QAMP application..." -ForegroundColor Yellow

pm2 delete ecosystem.config.js

Write-Host "Application stopped successfully!" -ForegroundColor Green
