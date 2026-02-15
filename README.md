# QA Platform (AI Test Case Generator + Personal QA)

Personal QA platform for generating, saving, organizing, and executing high-quality test cases using LLMs (Ollama, OpenAI, Gemini, or Groq). Includes:

- **AI generator** for batch test case generation.
- **SQLite-backed projects/modules** for persistent storage of test cases.
- **Execution table** UI for table-style execution (status + actual result).
- **Dashboard** with basic personal QA stats and recent activity.

## Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Ollama** (optional) — for local generation. Install from [ollama.ai](https://ollama.ai) and run `ollama pull llama3.2:3b` (or your chosen model).
- **OpenAI API key** (optional) — for cloud generation and embedding-based deduplication. Set `AI_TC_GEN_OPENAI_API_KEY`.
- **Gemini API key** (optional) — for Gemini 2.5 Flash. Set `AI_TC_GEN_GEMINI_API_KEY`.
- **Groq API key** (optional) — for Llama 3.3 70B (Groq). Set `AI_TC_GEN_GROQ_API_KEY`.

## Project layout

```text
qamp/
├── backend/                # Python FastAPI app (run from here)
│   ├── app/                # Application package
│   │   ├── main.py         # FastAPI app (uvicorn app.main:app)
│   │   ├── api/            # Health + test case + project/module endpoints
│   │   ├── core/           # Config, logging
│   │   ├── database/       # SQLAlchemy connection + models
│   │   ├── providers/      # LLM providers (Ollama, OpenAI, Gemini, Groq)
│   │   ├── schemas/        # Pydantic request/response models
│   │   ├── services/       # Business logic (generation, batch, dedup)
│   │   └── utils/          # Prompts, embeddings, token allocation, Excel, excel_template_merge
│   ├── tests/
│   ├── main.py             # Optional entrypoint (python main.py)
│   └── requirements.txt
├── frontend/               # React + Vite UI
│   └── src/
│       ├── components/
│       │   ├── GenerationForm, BatchResultsView            # AI generator
│       │   ├── ProjectManagement/*                         # Projects, modules, Save-to-Project
│       │   ├── TestExecution/*                             # Execution table + detail modal
│       │   └── Dashboard/PersonalDashboard                 # Personal stats view
│       └── api/client.ts                                   # Single API client for backend
├── package.json            # Root: npm run dev (backend + frontend)
├── .env                    # Backend env vars (at root; backend loads via path)
└── DOCUMENTATION.md        # Full production documentation
```

## First-time setup

Run these steps once after cloning or moving the project. All commands are from the **project root** (e.g. `F:\project\tool\newaitool\qamp` or `/home/user/projects/qamp`).

### 1. Python virtual environment and backend dependencies

Create a virtual environment and install backend dependencies so the API runs in an isolated environment (avoids path issues when moving the project).

**Windows (PowerShell):**

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

**Linux:**

On Debian/Ubuntu, ensure the venv module is installed: `sudo apt install python3-venv python3-pip`.

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

**macOS:**

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

### 2. Node dependencies

Install root and frontend dependencies (concurrently is used by `npm run dev`):

```bash
npm install
npm install --prefix frontend
```

### 3. Environment (optional)

- **Backend:** Copy `.env.example` to `.env` in the project root and set API keys if you use OpenAI, Gemini, or Groq. The backend loads `.env` from the project root.
- **Frontend:** Only needed if you run the frontend against a different API URL; see [Frontend](#frontend) below.

### 4. Run the app

```bash
npm run dev
```

This starts the backend at `http://localhost:8000` and the frontend at `http://localhost:5173`. Open `http://localhost:5173` in your browser.

The root `package.json` dev script uses the project’s `venv` for the backend on Windows, so you don’t need to activate the venv before `npm run dev`. On macOS/Linux, activate the venv first, then run `npm run dev`.

---

## Installation (reference)

### Backend

Use the project’s virtual environment. From the project root:

**Windows:**

```powershell
.\venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

**macOS / Linux:**

```bash
source venv/bin/activate
pip install -r backend/requirements.txt
```

To run the backend only with the venv: from project root, `cd backend` then run `..\venv\Scripts\python.exe -m uvicorn app.main:app --reload` (Windows) or `../venv/bin/python -m uvicorn app.main:app --reload` (macOS/Linux).

### Frontend

Requires **Node.js 18+**. From the project root:

```bash
npm install
npm install --prefix frontend
```

Or from the frontend folder: `cd frontend && npm install`.

**Environment (optional)** — Create `frontend/.env` if you need to override the API base URL (e.g. when running frontend separately or in production):

```bash
# frontend/.env
VITE_API_BASE_URL=http://localhost:8000
```

Leave this unset during local dev with `npm run dev` from root; the Vite proxy forwards `/api` to the backend automatically.

**Available scripts** (from `frontend/`):

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server (port 5173) with HMR |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve production build locally |

## Running the application

### Recommended: Backend + frontend together

From the project root:

```bash
npm run dev
```

This starts:

- **Backend** at `http://localhost:8000`
- **Frontend** at `http://localhost:5173` (proxies `/api` to the backend)

Open `http://localhost:5173` in your browser.

### Main UI routes

- `/` — **AI Generator**  
  Configure features and generate test cases in batch. Generated results persist when you switch to Projects or Dashboard (they clear only when you run a new generation). From the batch results you can:
  - Export per-feature CSV.
  - Export merged CSV of all features.
  - Export to Excel template (per feature or all features).
  - **Save to Project** – bulk-save generated test cases into a selected project/module.

- `/projects` — **Projects list**  
  Create and edit projects (name, description) and open a project detail view.

- `/projects/:id` — **Project detail**  
  - Left: module tree (hierarchical folders) with per-module test case counts; **+ New Module** opens a modal to create a module (name + optional parent).
  - Right: execution table for all test cases in the selected module:
    - Status button cycles through **Not Executed → Passed → Failed → Blocked → Not Executed**.
    - Inline **Actual Result** text field.
    - **Save All Changes** persists all status and actual-result updates in one API call.
    - **View** opens a detail modal with full test case fields and execution history.
    - **Export** menu: CSV (this module / select modules), All Modules (ZIP), **Export to Excel** (select .xlsx file, merge current module), **Export to Excel (Select Modules)** (select .xlsx file + modules). Excel merge auto-detects target fields (scans sheets, row 1 and row 2) and falls back to single-row header if multi-row fails.

- `/dashboard` — **Personal dashboard**  
  High-level QA stats (total cases, executed, pass rate, pending) and recent execution activity.

### Run backend only

With the project venv activated, from the project root:

```bash
cd backend && uvicorn app.main:app --reload
```

Or without activating venv (Windows): `cd backend && ..\venv\Scripts\python.exe -m uvicorn app.main:app --reload`.  
macOS/Linux: `cd backend && ../venv/bin/python -m uvicorn app.main:app --reload`.

Alternatively: `cd backend && python main.py` (no reload; use the venv’s Python if not activated).

API at `http://localhost:8000`. OpenAPI docs at `http://localhost:8000/docs`.

### Run frontend only

```bash
cd frontend && npm run dev
```

Ensure the backend is already running at `http://localhost:8000`, or set `VITE_API_BASE_URL` in `frontend/.env` to point to the API.

### Run backend tests

With the venv activated, from the project root:

```bash
cd backend && python -m pytest tests/ -v
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_TC_GEN_DEFAULT_LLM_PROVIDER` | `ollama` | `ollama`, `openai`, `gemini`, or `groq` |
| `AI_TC_GEN_OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base URL |
| `AI_TC_GEN_OLLAMA_MODEL` | `llama3.2:3b` | Ollama model name |
| `AI_TC_GEN_OPENAI_API_KEY` | — | Required for OpenAI provider and embeddings |
| `AI_TC_GEN_OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model |
| `AI_TC_GEN_GEMINI_API_KEY` | — | Required for Gemini provider. Set in `.env`. |
| `AI_TC_GEN_GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model name |
| `AI_TC_GEN_GROQ_API_KEY` | — | Required for Groq provider (Llama 3.3 70B). Set in `.env`. |
| `AI_TC_GEN_GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model name |
| `AI_TC_GEN_DATABASE_URL` | `sqlite:///./testcases.db` | SQLAlchemy URL for persistent storage (projects, modules, test cases, executions) |
| `VITE_API_BASE_URL` | (empty) | API base URL in production; empty uses dev proxy |

Use `.env` in the project root for backend variables (the backend loads it from the project root when run from `backend/`). Use `frontend/.env` for `VITE_*` variables. The SQLite file is created in the backend working directory when the app starts.

## Key API endpoints

- `GET /api/health` — health check

**AI generation & export**

- `POST /api/testcases/generate-test-cases` — single-feature generation. Body: `feature_name`, `feature_description`, `coverage_level` (low|medium|high|comprehensive). Optional `?generate_excel=true`.
- `POST /api/testcases/batch-generate` — start batch; returns `batch_id`.
- `GET /api/testcases/batches/{batch_id}` — batch status and per-feature results.
- `POST /api/testcases/batches/{batch_id}/features/{feature_id}/retry` — retry failed feature.
- `GET /api/testcases/batches/{batch_id}/export-all` — download merged CSV.
- `POST /api/testcases/export-to-excel` — **Export to Excel template** (single feature). Multipart: `template` (.xlsx), `testCases` (JSON), `featureName`.
- `POST /api/testcases/export-all-to-excel` — **Export all features to Excel template**. Multipart: `template` (.xlsx), `testCasesByFeature` (JSON array of `{ featureName, testCases }`).
- `DELETE /api/testcases/{id}` — delete in-memory test case (excluded from exports).
- `GET /api/testcases/csv-filename?feature_name=` — OS-safe filename for per-feature export.

**Persistent QA platform**

- `POST /api/projects` — create project.
- `GET /api/projects` — list all projects with module counts.
- `GET /api/projects/{id}` — project + module tree.
- `PUT /api/projects/{id}` — update project.
- `DELETE /api/projects/{id}` — delete project (cascade modules + test cases + executions).

- `POST /api/projects/{project_id}/modules` — create module under project.
- `GET /api/projects/{project_id}/modules` — module tree for project.
- `PUT /api/modules/{id}` — update module.
- `DELETE /api/modules/{id}` — delete module (cascade submodules + test cases + executions).

- `POST /api/testcases/save-to-project` — bulk save generated test cases into a module.
- `GET /api/testcases/modules/{module_id}/testcases` — list all test cases in a module (with latest execution).
- `PUT /api/testcases/{id}/execute` — record execution for a single test case.
- `POST /api/testcases/modules/{module_id}/execute-batch` — batch record executions for many test cases in a module.
- `GET /api/testcases/{id}/executions` — execution history for a test case.
- `DELETE /api/testcases/db/{id}` — delete persisted test case.

- `GET /api/dashboard` — (optional) aggregate stats for dashboard (total cases, executed, pass rate, recent activity).

- `POST /api/testcases/modules/{module_id}/export-to-excel-template` — **Export to Excel** (single module). Multipart: `template` (.xlsx). Merges test cases into template with auto-detection (scans sheets for target headers in row 1 or row 2) and fallback (multi-row → single-row on error).
- `POST /api/testcases/modules/export-to-excel-template-combined` — **Export to Excel (Select Modules)**. Multipart: `template` (.xlsx), `module_ids` (JSON array). Same merge logic as above for multiple modules combined.

See `DOCUMENTATION.md` for full API reference, Excel template structure, and architecture details.
