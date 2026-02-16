# Local Development

Run QAMP on your machine for development. All commands assume you are in the **project root**.

---

## Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Ollama** (optional) — [ollama.ai](https://ollama.ai), then `ollama pull llama3.2:3b`
- **API keys** (optional) — OpenAI, Gemini, or Groq for cloud generation

---

## First-time setup

### 1. Python virtual environment and backend

**Linux / macOS:**

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

**Windows:**

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

### 2. Node dependencies

```bash
npm install
npm install --prefix frontend
```

### 3. Environment (optional)

- **Backend:** Copy `.env.example` to `.env` in project root. Set API keys if you use OpenAI, Gemini, or Groq.
- **Frontend:** Only needed if the API is not at `http://localhost:8000`. Create `frontend/.env` with `VITE_API_BASE_URL=http://localhost:8000` (or leave unset; Vite proxies `/api` to the backend).

### 4. Run the app

```bash
npm run dev
```

- **Backend:** http://localhost:8000  
- **Frontend:** http://localhost:5173 (dev server port is set in `frontend/vite.config.ts`)  

Open the frontend URL in your browser. On Windows, the root `npm run dev` uses the project venv for the backend; on macOS/Linux, activate the venv first, then run `npm run dev`.

---

## Running parts separately

### Backend only

With venv activated (or using the venv Python explicitly):

```bash
cd backend
uvicorn app.main:app --reload
```

Or from project root:

```bash
cd backend && ../venv/bin/python -m uvicorn app.main:app --reload   # macOS/Linux
cd backend && ..\venv\Scripts\python.exe -m uvicorn app.main:app --reload  # Windows
```

API: http://localhost:8000 — Docs: http://localhost:8000/docs

### Frontend only

```bash
cd frontend
npm run dev
```

Backend must be running at http://localhost:8000, or set `VITE_API_BASE_URL` in `frontend/.env`.

### Backend tests

```bash
cd backend
python -m pytest tests/ -v
```

---

## Main UI routes

| Route | Description |
|-------|-------------|
| `/` | AI Generator — batch test case generation, export, Save to Project |
| `/projects` | Projects list |
| `/projects/:id` | Project detail — module tree, execution table, exports |
| `/dashboard` | Personal dashboard — stats and recent activity |

---

## Environment variables (reference)

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_TC_GEN_DEFAULT_LLM_PROVIDER` | `ollama` | `ollama`, `openai`, `gemini`, or `groq` |
| `AI_TC_GEN_OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base |
| `AI_TC_GEN_OLLAMA_MODEL` | `llama3.2:3b` | Ollama model |
| `AI_TC_GEN_OPENAI_API_KEY` | — | Required for OpenAI |
| `AI_TC_GEN_OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model |
| `AI_TC_GEN_GEMINI_API_KEY` | — | Required for Gemini |
| `AI_TC_GEN_GROQ_API_KEY` | — | Required for Groq |
| `AI_TC_GEN_DATABASE_URL` | `sqlite:///./testcases.db` | SQLite path (backend dir) |
| `AI_TC_GEN_AUTH_USERNAME` / `AI_TC_GEN_AUTH_PASSWORD` | — | Basic auth when set |
| `VITE_API_BASE_URL` | (empty) | Override API URL for frontend |

Use `.env` in **project root** for backend; use `frontend/.env` for `VITE_*`.

---

## Project layout

```
qamp/
├── backend/           # FastAPI app
│   ├── app/           # main, api, core, database, schemas, services, providers, utils
│   ├── tests/
│   ├── main.py
│   └── requirements.txt
├── frontend/          # React + Vite
│   └── src/
│       ├── api/       # client.ts, auth, types
│       └── components/
├── .env               # Backend env (root)
├── package.json       # npm run dev
└── docs/
```

For full architecture and API reference, see [architecture.md](architecture.md).
