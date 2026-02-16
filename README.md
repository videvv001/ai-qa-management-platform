# QAMP

Personal QA platform for generating, saving, organizing, and executing test cases using LLMs (Ollama, OpenAI, Gemini, or Groq).

**Features:**

- **AI generator** — Batch test case generation from feature descriptions
- **Projects & modules** — SQLite-backed storage with hierarchical modules
- **Execution table** — Record status (Passed/Failed/Blocked) and actual results
- **Dashboard** — Personal QA stats and recent activity
- **Export** — CSV (per-feature or merged), Excel template merge, Save to Project

---

## Tech stack

| Layer   | Stack |
|---------|--------|
| Backend | Python 3.10+, FastAPI, SQLAlchemy (SQLite), Pydantic |
| Frontend| Node.js 18+, React 18, Vite 5, TypeScript, Tailwind CSS |
| LLMs    | Ollama (local), OpenAI, Gemini, Groq |

---

## Quick start

**Prerequisites:** Python 3.10+, Node.js 18+

### Linux / macOS

1. **Clone and install**
   ```bash
   git clone https://github.com/your-username/qamp.git
   cd qamp
   python3 -m venv venv
   source venv/bin/activate
   pip install -r backend/requirements.txt
   npm install && npm install --prefix frontend
   ```

2. **Environment (optional)**  
   Copy `.env.example` to `.env` in the project root and set API keys (OpenAI, Gemini, Groq) if needed.

3. **Run**
   ```bash
   npm run dev
   ```

### Windows (PowerShell)

1. **Clone and install**
   ```powershell
   git clone https://github.com/your-username/qamp.git
   cd qamp
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r backend/requirements.txt
   npm install; npm install --prefix frontend
   ```

2. **Environment (optional)**  
   Copy `.env.example` to `.env` in the project root and set API keys (OpenAI, Gemini, Groq) if needed.

3. **Run**
   ```powershell
   npm run dev
   ```
   (If the root `npm run dev` fails, run the backend and frontend separately: in one terminal `cd backend` then `..\venv\Scripts\python.exe -m uvicorn app.main:app --reload`, and in another `npm run dev --prefix frontend`.)

### After starting

- **Frontend:** http://localhost:5173  
- **Backend:** http://localhost:8000  
- **API docs:** http://localhost:8000/docs  

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/local-development.md](docs/local-development.md) | Local setup, running backend/frontend, env vars |
| [docs/verification.md](docs/verification.md) | Pre- and post-start verification |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Common issues and fixes |
| [docs/architecture.md](docs/architecture.md) | Architecture, API reference, usage |

---

## Project layout

```
qamp/
├── backend/       # FastAPI app (api, core, database, providers, services, utils)
├── frontend/      # React + Vite UI
├── .env           # Backend config (project root)
├── docs/          # Documentation
└── package.json   # npm run dev
```

---

## License

See [LICENSE](LICENSE).
