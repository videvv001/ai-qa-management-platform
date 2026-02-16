#!/usr/bin/env node
/**
 * Backend launcher for PM2 (Linux/Mac/Google Cloud).
 * Runs the FastAPI backend with python3.
 */
const path = require('path');
const { spawn } = require('child_process');

const backendDir = path.resolve(__dirname, 'backend');

const child = spawn(
  'python3',
  ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000'],
  {
    cwd: backendDir,
    stdio: 'inherit',
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  }
);

child.on('error', (err) => {
  console.error('Backend failed to start:', err.message);
  if (err.code === 'ENOENT') {
    console.error("\n'python3' not found. Install Python 3 and ensure it is in PATH.");
  }
  process.exit(1);
});

child.on('exit', (code, signal) => {
  process.exit(code != null ? code : signal ? 1 : 0);
});
