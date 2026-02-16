const path = require('path');
const fs = require('fs');

// Simple .env parser (no external dependencies needed)
function parseEnvFile(filePath) {
  const envConfig = {};
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Parse KEY=VALUE
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        envConfig[key] = value;
      }
    }
  }
  return envConfig;
}

// Load .env file from project root
const envPath = path.resolve(__dirname, '.env');
const envConfig = parseEnvFile(envPath);

module.exports = {
  apps: [
    {
      name: 'qamp-backend',
      cwd: path.resolve(__dirname, 'backend'),
      script: 'python',
      args: '-m uvicorn app.main:app --host 0.0.0.0 --port 8000',
      interpreter: 'none',
      env: {
        ...envConfig,
        PYTHONUNBUFFERED: '1',
        // Ensure the backend knows where to find the .env file
        AI_TC_GEN_ENV_FILE: path.resolve(__dirname, '.env')
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      // Logging
      error_file: path.resolve(__dirname, 'logs', 'backend-error.log'),
      out_file: path.resolve(__dirname, 'logs', 'backend-out.log'),
      log_file: path.resolve(__dirname, 'logs', 'backend-combined.log'),
      time: true,
      merge_logs: true
    },
    {
      name: 'qamp-frontend',
      cwd: path.resolve(__dirname, 'frontend'),
      script: 'npm',
      args: 'run preview',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      // Logging
      error_file: path.resolve(__dirname, 'logs', 'frontend-error.log'),
      out_file: path.resolve(__dirname, 'logs', 'frontend-out.log'),
      log_file: path.resolve(__dirname, 'logs', 'frontend-combined.log'),
      time: true,
      merge_logs: true
    }
  ]
};
