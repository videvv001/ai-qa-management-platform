# PowerShell script to start the application with PM2

Write-Host "Starting QAMP application with PM2..." -ForegroundColor Green

# Check if PM2 is installed
if (!(Get-Command pm2 -ErrorAction SilentlyContinue)) {
    Write-Host "PM2 is not installed. Please install it with: npm install -g pm2" -ForegroundColor Red
    exit 1
}

# Check if .env file exists
if (!(Test-Path ".env")) {
    Write-Host "Warning: .env file not found in project root!" -ForegroundColor Yellow
    Write-Host "Please create a .env file based on .env.example" -ForegroundColor Yellow
    exit 1
}

# Create logs directory if it doesn't exist
if (!(Test-Path "logs")) {
    Write-Host "Creating logs directory..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path "logs" | Out-Null
}

# Build the frontend first
Write-Host "Building frontend..." -ForegroundColor Cyan
Set-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Set-Location ..

# Stop any existing PM2 processes
Write-Host "Stopping existing PM2 processes..." -ForegroundColor Cyan
pm2 delete ecosystem.config.js 2>$null

# Start PM2 with ecosystem config
Write-Host "Starting PM2 processes..." -ForegroundColor Cyan
pm2 start ecosystem.config.js

# Show status
Write-Host "`nPM2 Status:" -ForegroundColor Green
pm2 status

Write-Host "`nApplication started successfully!" -ForegroundColor Green
Write-Host "Backend: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "`nUseful commands:" -ForegroundColor Yellow
Write-Host "  pm2 status          - Check application status" -ForegroundColor White
Write-Host "  pm2 logs            - View logs" -ForegroundColor White
Write-Host "  pm2 restart all     - Restart all processes" -ForegroundColor White
Write-Host "  pm2 stop all        - Stop all processes" -ForegroundColor White
Write-Host "  pm2 delete all      - Remove all processes" -ForegroundColor White
