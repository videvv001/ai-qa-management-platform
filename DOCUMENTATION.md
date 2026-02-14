# QA Platform — Production Documentation

## 1. Project Overview

### Purpose

QA Platform (qaplat) is a personal QA application that combines **AI-powered test case generation** with **persistent test management**. It produces structured test cases from feature descriptions using LLMs (Ollama, OpenAI, Gemini, or Groq), and stores them in **SQLite** under **projects** and **modules**. You can run executions (status + actual result) in a table UI and track history. The system supports single-feature and batch generation, scenario-driven coverage, deduplication, CSV/Excel export, **Save to Project**, and **execution tracking** with a dashboard.

### Problems It Solves

- **Manual effort**: Reduces time spent writing test cases from requirements.
- **Coverage gaps**: Uses coverage dimensions (core, validation, negative, boundary, state, security, destructive) to guide scenarios.
- **Duplication**: Applies embedding-based and title-based deduplication to avoid redundant test cases.
- **Inconsistency**: Produces standardized, structured test cases with scenario, description, preconditions, steps, and expected results.
- **Export flexibility**: Supports CSV (per-feature and merged) and Excel template export; upload an .xlsx template and merge test cases into the “Test Cases” sheet.
- **Persistence**: Organize test cases in projects and modules (SQLite); record execution status and actual results; view execution history and dashboard stats.

### Target Users

- QA engineers generating and organizing test cases from specs
- Developers performing exploratory test design and execution tracking
- Teams wanting local (Ollama) or cloud (OpenAI, Gemini, Groq) LLM-based generation with persistent storage

---

## 2. Architecture

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite, React Router)                  │
│  /  Generator   │  /projects   │  /projects/:id   │  /dashboard             │
│  GenerationForm │  ProjectList │  ModuleTree      │  PersonalDashboard      │
│  BatchResultsView│  ProjectForm│  ExecutionTable  │  (stats, recent activity)│
│  SaveToProjectModal │ NewModuleModal │ TestCaseDetailModal                   │
│                            │  API Client (fetch)                              │
└────────────────────────────┼─────────────────────────────────────────────────┘
                             │  HTTP/REST
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Backend (FastAPI)                                    │
│  ┌─────────────┐     ┌──────────────────┐     ┌───────────────────────────┐  │
│  │api/testcases│────▶│TestCaseService   │────▶│Providers (Ollama/OpenAI/  │  │
│  │api/health   │     │(in-memory batch) │     │ Gemini/Groq)              │  │
│  │api/projects │     └────────┬─────────┘     └───────────────────────────┘  │
│  │api/modules  │             │                                               │
│  └──────┬──────┘             ▼                                               │
│         │          ┌─────────────────────────────────────────────────────┐  │
│         │          │ utils: prompt_builder, embeddings, token_allocation, │  │
│         │          │        csv_filename, excel_exporter, excel_template_merge│
│         │          └─────────────────────────────────────────────────────┘  │
│         │                                                                     │
│         ▼          ┌─────────────────────────────────────────────────────┐  │
│  ┌─────────────┐   │ database: SQLAlchemy (SQLite)                        │  │
│  │ app.database│   │ Project, Module, TestCase, TestExecution             │  │
│  │ connection  │   │ save-to-project, execute-batch, modules/testcases   │  │
│  │ models      │   └─────────────────────────────────────────────────────┘  │
│  └─────────────┘                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  External / local                                                            │
│  - Ollama (localhost:11434) — local LLM                                      │
│  - OpenAI API — chat completions + embeddings                                │
│  - SQLite (testcases.db) — persistent projects, modules, cases, executions │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Relationships

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| **API** | `app.api.health` | Liveness/readiness probe |
| **API** | `app.api.testcases` | AI generation, batch, export; plus save-to-project, modules testcases, execute, execute-batch, executions, delete DB case |
| **API** | `app.api.projects` | CRUD projects; get project with module tree |
| **API** | `app.api.modules` | CRUD modules under a project; module tree |
| **Database** | `app.database.connection` | SQLAlchemy engine (SQLite), SessionLocal, get_db, init_db |
| **Database** | `app.database.models` | Project, Module, TestCase, TestExecution (ORM) |
| **Service** | `TestCaseService` (`app.services`) | AI generation, batch orchestration, in-memory batch/store, dedup |
| **Providers** | `OllamaProvider`, `OpenAIProvider`, `GeminiProvider`, `GroqProvider` (`app.providers`) | LLM calls; implement `LLMProvider` interface |
| **Utils** | `prompt_builder`, `embeddings`, `token_allocation` | Prompts, semantic dedup, max_tokens |
| **Utils** | `csv_filename`, `excel_exporter`, `excel_template_merge` | Exports and Excel template merge |

### Data Flow

**Single feature (generate-test-cases)**  
1. `GenerateTestCasesRequest` → `TestCaseService.generate_ai_test_cases()`  
2. For each coverage layer: `_extract_scenarios()` (Pass 1) → `deduplicate_scenarios()` → `_expand_scenarios_to_tests()` (Pass 2)  
3. Accumulate, then `_deduplicate_by_embeddings()` and `_remove_near_duplicate_titles()`  
4. Persist in `_store`, return `TestCaseListResponse`

**Batch**  
1. `POST /batch-generate` → `start_batch()` creates `_BatchState`, spawns `asyncio.gather()` per feature  
2. Each feature runs `_run_one_feature()` → `generate_ai_test_cases()` → updates `fr.items`  
3. Frontend polls `GET /batches/{batch_id}` (e.g. 1.5s interval) until `completed` or `partial`  
4. Per-feature export: frontend calls `getCsvFilename()`, then `exportToCsv(items)`; or **Export to Excel Template**: upload .xlsx → `POST /export-to-excel` (template, testCases, featureName) → merged Excel download.  
5. Export All: `GET /batches/{batch_id}/export-all` → merged CSV; or **Export All to Excel Template**: upload .xlsx → `POST /export-all-to-excel` (template, testCasesByFeature) → one Excel with all features’ test cases combined in the “Test Cases” sheet.

**Delete (in-memory)**  
1. `DELETE /testcases/{id}` → `delete_test_case()` removes from `_store` and from all `fr.items`  
2. Frontend calls `deleteTestCase()` then `getBatchStatus()` to refresh UI

**Save to Project**  
1. User clicks “Save to Project” on a feature in batch results → `SaveToProjectModal` opens.  
2. User selects project and module → `saveTestCasesToProject(moduleId, testCases)` → `POST /api/testcases/save-to-project` with `module_id` and `test_cases` array.  
3. Backend inserts `TestCase` rows into the module; frontend closes modal.

**Projects & modules**  
1. Projects: CRUD via `app.api.projects`; list returns `modules_count`.  
2. Modules: CRUD via `app.api.modules`; tree via `GET /api/projects/{id}/modules`.  
3. Project detail UI: module tree (expand/collapse, select module); “+ New Module” opens modal (name + optional parent) → `createModule(projectId, { name, parent_id })` → refresh tree.

**Execution**  
1. Project detail: select module → `GET /api/testcases/modules/{module_id}/testcases` → `ExecutionTable` shows rows (Status, Test ID, Scenario, Actual Result, View).  
2. User toggles status (Not Executed → Passed → Failed → Blocked) and edits actual result; clicks “Save All Changes” → `POST /api/testcases/modules/{module_id}/execute-batch` with `executions: [{ test_case_id, status, actual_result, notes }]`.  
3. Backend creates `TestExecution` rows; frontend refetches test cases.  
4. “View” opens `TestCaseDetailModal` with full case and `GET /api/testcases/{id}/executions` history.

### External Services

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Ollama** | Local LLM inference | `AI_TC_GEN_OLLAMA_BASE_URL`, `AI_TC_GEN_OLLAMA_MODEL` |
| **OpenAI Chat** | Cloud LLM (gpt-4o-mini, gpt-4o) | `AI_TC_GEN_OPENAI_API_KEY`, `AI_TC_GEN_OPENAI_MODEL` |
| **OpenAI Embeddings** | Dedup (text-embedding-3-small, text-embedding-3-large) | Same API key as Chat |
| **Gemini API** | Cloud LLM (gemini-2.5-flash) | `AI_TC_GEN_GEMINI_API_KEY`, `AI_TC_GEN_GEMINI_MODEL` |
| **Groq API** | Cloud LLM (llama-3.3-70b-versatile) | `AI_TC_GEN_GROQ_API_KEY`, `AI_TC_GEN_GROQ_MODEL` |

---

## 3. Tech Stack

### Languages

- **Python 3.x** — Backend
- **TypeScript** — Frontend

### Frameworks

- **FastAPI** — Async HTTP API, OpenAPI, Pydantic validation
- **React 18** — UI
- **Vite 5** — Frontend build, HMR, proxy to backend

### Key Libraries

| Package | Purpose |
|---------|---------|
| `uvicorn` | ASGI server |
| `pydantic`, `pydantic-settings` | Schemas, config from env |
| `httpx` | Async HTTP (Ollama) |
| `openai` | OpenAI Chat + Embeddings API |
| `google-genai` | Gemini API (google-genai SDK) |
| `groq` | Groq API (llama-3.3-70b-versatile) |
| `tiktoken` | Token estimation for dynamic max_tokens |
| `openpyxl` | Excel export and template merge |
| `python-multipart` | Multipart form (file + form fields for export-to-excel) |
| `lucide-react` | Icons |
| `tailwindcss` | Styling |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Component variants |

### Rationale

- **FastAPI**: Async, type-safe, built-in OpenAPI
- **Pydantic**: Strong validation for LLM JSON output and API contracts
- **Provider abstraction**: Swappable LLM backends (Ollama, OpenAI, Gemini, Groq)
- **Vite**: Fast dev, proxy to backend without CORS

---

## 4. Folder Structure

```
qaplat/
├── backend/                # Python FastAPI app (run from here)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py         # App factory, FastAPI app, init_db on startup
│   │   ├── api/
│   │   │   ├── __init__.py  # Route registration (health, testcases, projects, modules)
│   │   │   ├── health.py    # GET /api/health
│   │   │   ├── testcases.py # AI generation, batch, export; save-to-project, modules testcases, execute, execute-batch, executions
│   │   │   ├── projects.py  # CRUD projects
│   │   │   └── modules.py   # CRUD modules (under project)
│   │   ├── core/
│   │   │   ├── config.py   # Settings (pydantic-settings), database_url, .env from project root
│   │   │   └── logging_config.py
│   │   ├── database/
│   │   │   ├── connection.py # Engine, SessionLocal, get_db, init_db
│   │   │   └── models.py    # Project, Module, TestCase, TestExecution (SQLAlchemy ORM)
│   │   ├── schemas/
│   │   │   ├── testcase.py  # AI/batch request/response models
│   │   │   └── project.py   # ProjectCreate/Response, ModuleCreate/Response, TestCaseSave, TestExecution*, BatchExecutionUpdate
│   │   ├── services/
│   │   │   └── testcase_service.py # AI generation, batch orchestration (in-memory)
│   │   ├── providers/      # base, factory, ollama, openai, gemini, groq
│   │   └── utils/          # prompt_builder, embeddings, token_allocation, csv_filename, excel_*
│   ├── tests/
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/             # client.ts (all backend calls), types.ts
│   │   ├── components/      # GenerationForm, BatchResultsView, ResultsTable, TemplateUploadModal
│   │   │   ├── ProjectManagement/  # ProjectList, ProjectForm, ProjectDetail, ModuleTree, SaveToProjectModal, NewModuleModal (in ProjectDetail)
│   │   │   ├── TestExecution/     # ExecutionTable, TestCaseDetailModal
│   │   │   └── Dashboard/         # PersonalDashboard
│   │   ├── hooks/           # useTemplateStorage
│   │   └── index.css
│   ├── vite.config.ts       # Proxy /api → backend
│   └── package.json
├── venv/
├── .env
├── package.json             # Root: npm run dev (backend + frontend)
└── DOCUMENTATION.md
```

### Responsibilities

| Directory | Responsibility |
|-----------|----------------|
| `backend/app/api/` | HTTP routing, error handling; health, testcases, projects, modules |
| `backend/app/core/` | App config (including database_url), logging |
| `backend/app/database/` | SQLite connection, ORM models, get_db dependency, init_db |
| `backend/app/schemas/` | Pydantic request/response (testcase, project) |
| `backend/app/services/` | AI generation, batch, in-memory store, dedup |
| `backend/app/providers/` | LLM abstraction, provider implementations |
| `backend/app/utils/` | Prompts, embeddings, tokens, filenames, Excel |
| `frontend/` | React app, React Router, API client, Generator / Projects / Dashboard UI |

---

## 5. Setup Guide

### Prerequisites

- Python 3.10+
- Node.js 18+
- (Optional) Ollama for local generation
- (Optional) OpenAI API key for cloud generation + embeddings
- (Optional) Gemini API key for Gemini 2.5 Flash
- (Optional) Groq API key for Llama 3.3 70B (Groq)

### First-time setup (from project root)

Use a **virtual environment** for the backend so the project is portable (e.g. after moving or cloning). All commands below are from the project root.

**1. Python virtual environment and backend dependencies**

Windows (PowerShell):

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

macOS / Linux:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

**2. Node dependencies**

```bash
npm install
npm install --prefix frontend
```

**3. Environment (optional)** — Copy `.env.example` to `.env` in the project root and set API keys (OpenAI, Gemini, Groq) as needed.

See **README.md** for the full first-time setup and run instructions.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_TC_GEN_DEFAULT_LLM_PROVIDER` | `ollama` | `ollama`, `openai`, `gemini`, or `groq` |
| `AI_TC_GEN_OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API URL |
| `AI_TC_GEN_OLLAMA_MODEL` | `llama3.2:3b` | Ollama model name |
| `AI_TC_GEN_OLLAMA_TIMEOUT_SECONDS` | `600` | Ollama read timeout |
| `AI_TC_GEN_OPENAI_API_KEY` | — | Required for OpenAI provider and embeddings |
| `AI_TC_GEN_OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model |
| `AI_TC_GEN_OPENAI_TIMEOUT_SECONDS` | `120` | OpenAI timeout |
| `AI_TC_GEN_GEMINI_API_KEY` | — | Required for Gemini provider |
| `AI_TC_GEN_GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model |
| `AI_TC_GEN_GROQ_API_KEY` | — | Required for Groq provider |
| `AI_TC_GEN_GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model |
| `AI_TC_GEN_LOG_LEVEL` | `INFO` | Logging level |
| `AI_TC_GEN_DATABASE_URL` | `sqlite:///./testcases.db` | SQLAlchemy URL; SQLite file created in backend working directory |
| `VITE_API_BASE_URL` | (empty) | Override API base in production; empty uses proxy |

Use `.env` in the project root for backend variables (the backend loads it from the project root when run from `backend/`). Use `frontend/.env` for `VITE_*` variables.

### Running Locally

```bash
# Backend + frontend (recommended, from project root)
npm run dev
# Starts backend (using project venv on Windows) and frontend. No need to activate venv on Windows.
# On macOS/Linux: activate venv first (source venv/bin/activate), then npm run dev.
# Backend: http://localhost:8000  |  Frontend: http://localhost:5173

# Run backend only (with venv activated, from project root):
cd backend && uvicorn app.main:app --reload
# Without activating venv: cd backend && ..\venv\Scripts\python.exe -m uvicorn app.main:app --reload (Windows)
#                         cd backend && ../venv/bin/python -m uvicorn app.main:app --reload (macOS/Linux)
# API at http://localhost:8000. OpenAPI docs at http://localhost:8000/docs

# Run frontend only (ensure backend is running first):
cd frontend && npm run dev
```

Frontend proxies `/api` to `http://localhost:8000` via Vite.

---

## 6. Usage Guide

### Single-Feature Generation (API)

```bash
curl -X POST http://localhost:8000/api/testcases/generate-test-cases \
  -H "Content-Type: application/json" \
  -d '{
    "feature_name": "User Login",
    "feature_description": "Users authenticate via email and password.",
    "coverage_level": "medium",
    "provider": "openai"
  }'
```

### Batch Generation (UI)

1. Open `http://localhost:5173` (Generator tab `/`).
2. Add one or more feature tabs (Name, Description, Allowed/Excluded, Coverage).
3. Choose model from the dropdown (default: **Gemini 2.5 Flash**). Options: Gemini 2.5 Flash, Llama 3.3 70B (Groq), Llama 3.2 3B (Local), GPT-4o Mini, GPT-4o.
4. Click **Generate Test Cases**.
5. Polling shows per-feature status; expand features to view results. **Generated results persist when you switch to Projects or Dashboard** (cleared only when you run a new generation).
6. Export: **Export CSV** per feature; **Export All Features** for merged CSV; **Export to Excel Template** (per feature) or **Export All to Excel Template** (all features). Or **Save to Project** to bulk-save into a project/module.

### Projects and modules

1. Go to **Projects** (`/projects`). Create or edit projects (name, description).
2. Open a project → **Project detail** (`/projects/:id`). Left sidebar: **module tree** (expand/collapse; click to select module). Click **+ New Module** to create a module (name + optional parent); tree refreshes after creation.
3. Select a module → right side shows **Execution table** for all test cases in that module.

### Test execution

1. In the execution table: **Status** button cycles Not Executed → Passed → Failed → Blocked; **Actual Result** is an inline text field.
2. Click **Save All Changes** to persist all status and actual-result updates in one request (`POST /api/testcases/modules/{module_id}/execute-batch`).
3. **View** (eye icon) opens a modal with full test case details and execution history.

### Export Workflow

- **Per-feature CSV**: Uses backend-generated filename (`tc_{feature}_{timestamp}.csv`).
- **Export All (CSV)**: `GET /api/testcases/batches/{batch_id}/export-all` returns merged, deduplicated CSV.
- **Export to Excel Template (single feature)**: Click “Export to Excel Template” on a feature → upload .xlsx (or use stored template) → optional “Remember this template” → Export. Backend merges that feature’s test cases into the template’s “Test Cases” sheet; **Summary** sheet is unchanged.
- **Export All to Excel Template**: Click “Export All to Excel Template” (top right) → same template upload → Export. All features’ test cases are combined in order into the single “Test Cases” sheet (e.g. Feature1’s 5 cases, then Feature2’s 3 cases = 8 rows). Column A = sequential No. (1–8); Column B = Test ID per feature (e.g. `TC_FEAT1_001`, `TC_FEAT2_001`). The backend returns a timestamped filename including UTC date and time (e.g. `All_Features_Test_Cases_2026-02-11_1432.xlsx`); the frontend mirrors this pattern if the header is missing.

### Excel Template Structure

The template must contain a sheet named **“Test Cases”**. Expected layout:

- **Rows 1–2**: Headers (merged cells allowed). Not modified.
- **Row 3+**: Data rows. Existing data is cleared; new test cases are written from row 3.
- **Columns A–L**: No., Test ID, Test Scenario, Test Description, Pre-condition, Test Data, Step (enumerated), Expected Result, Actual Result, Status, Comment, (empty). Formatting from row 3 is applied to new rows.

If the template has a **Summary** sheet, it is left unchanged. Template file limit: 10 MB; `.xlsx` only.

### Delete Test Case

- Use the trash icon on a test case row in batch results.
- The test case is removed from the batch and excluded from all exports.

---

## 7. API Documentation

Base URL: `http://localhost:8000` (or configured host)

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness/readiness |

### Test Cases (AI generation & in-memory)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/testcases/from-requirements` | Generate from requirements (non-LLM) |
| POST | `/api/testcases/generate-test-cases` | Generate via LLM; optional `?generate_excel=true` |
| GET | `/api/testcases` | List all (in-memory) |
| GET | `/api/testcases/{id}` | Get by ID (in-memory) |
| DELETE | `/api/testcases/{id}` | Delete in-memory case (removed from batch and exports) |
| GET | `/api/testcases/csv-filename` | `?feature_name=` for OS-safe filename |
| POST | `/api/testcases/export-to-excel` | Export to Excel template (single feature). Multipart: `template`, `testCases`, `featureName`. |
| POST | `/api/testcases/export-all-to-excel` | Export all to Excel template. Multipart: `template`, `testCasesByFeature`. |

### Batch

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/testcases/batch-generate` | Start batch; returns `batch_id` |
| GET | `/api/testcases/batches/{batch_id}` | Batch status and per-feature results |
| POST | `/api/testcases/batches/{batch_id}/features/{feature_id}/retry` | Retry failed feature |
| GET | `/api/testcases/batches/{batch_id}/export-all` | Merged CSV download |

### Projects

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/projects` | Create project |
| GET | `/api/projects` | List all projects (with module counts) |
| GET | `/api/projects/{id}` | Get project and module tree |
| PUT | `/api/projects/{id}` | Update project |
| DELETE | `/api/projects/{id}` | Delete project (cascade modules, test cases, executions) |

### Modules

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/projects/{project_id}/modules` | Create module (body: name, optional parent_id) |
| GET | `/api/projects/{project_id}/modules` | Module tree for project |
| PUT | `/api/modules/{id}` | Update module |
| DELETE | `/api/modules/{id}` | Delete module (cascade children and test cases) |

### Persistent test cases & execution

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/testcases/save-to-project` | Bulk save generated test cases into a module (body: module_id, test_cases[]) |
| GET | `/api/testcases/modules/{module_id}/testcases` | List test cases in module (with latest_execution) |
| PUT | `/api/testcases/{id}/execute` | Record one execution (body: status, actual_result, notes) |
| POST | `/api/testcases/modules/{module_id}/execute-batch` | Batch record executions (body: executions[{ test_case_id, status, actual_result, notes }]) |
| GET | `/api/testcases/{id}/executions` | Execution history for a test case |
| DELETE | `/api/testcases/db/{id}` | Delete persisted test case |

### Dashboard

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard` | (Optional) Aggregate stats: total cases, executed, pass rate, recent activity |

### Key Schemas

**GenerateTestCasesRequest**

- `feature_name`, `feature_description` (required)
- `coverage_level`: `low` \| `medium` \| `high` \| `comprehensive`
- `provider`: `ollama` \| `openai` \| `gemini` \| `groq` (optional; derived from `model_id` when set)
- `model_id`: `gpt-4o-mini` \| `gpt-4o` \| `gemini-2.5-flash` \| `llama-3.3-70b-versatile` \| `llama3.2:3b` (optional; when set, provider is derived from it)

**BatchGenerateRequest**

- `provider` (optional; derived from `model_id` when set)
- `model_id`: model identifier (optional; when set, provider is derived: gpt-4o-mini/gpt-4o→openai, gemini-2.5-flash→gemini, llama-3.3-70b-versatile→groq, llama3.2:3b→ollama)
- `features`: list of `{feature_name, feature_description, coverage_level, ...}`

**Persistent QA (see `app.schemas.project`)**  
- `ProjectCreate` / `ProjectResponse`; `ModuleCreate` / `ModuleResponse` (tree with `children`, `test_cases_count`).  
- `TestCaseSave` (module_id, test_cases[]); `TestExecutionUpdate` (status, actual_result, notes); `TestExecutionResponse`; `BatchExecutionUpdate` (executions: list of test_case_id, status, actual_result, notes).

OpenAPI spec: `http://localhost:8000/docs`

---

## 8. Testing Strategy

### Current Tests

- `backend/tests/test_health.py`: Health endpoint returns 200 and expected body fields.

### Test Execution

With the project venv activated, from the project root:

```bash
cd backend && python -m pytest tests/ -v
```

If the venv is not activated, use the venv’s Python: `cd backend && ..\venv\Scripts\python.exe -m pytest tests/ -v` (Windows) or `../venv/bin/python -m pytest tests/ -v` (macOS/Linux).

### Gaps and Recommendations

- **Unit tests**: `TestCaseService` methods, `prompt_builder`, `embeddings`, `token_allocation`.
- **Integration tests**: Batch flow with mocked LLM.
- **E2E**: Playwright/Cypress for critical UI flows.
- **LLM output**: Snapshot tests for JSON parsing and fallbacks.

---

## 9. Scalability Considerations

### Current State

- **Persistent storage (SQLite)**: Projects, modules, test cases, and test executions are stored in `testcases.db`; created on app startup via `init_db()`. Survives restarts.
- **In-memory (generator only)**: AI batch state (`_batch_store`, `_store` for generated cases) is process-local; batch results are lost on restart. Use “Save to Project” to persist generated cases.
- **Single process**: No horizontal scaling; batches and API run in one process.
- **Embeddings**: OpenAI API calls add latency and cost; no local embedding option.
- **Ollama**: No load balancing; single instance.

### Suggested Improvements

- **Batch persistence**: Optionally persist batch state or queue batch jobs (e.g. Celery/RQ, Redis).
- **Caching**: Cache embeddings per scenario text; TTL-based invalidation.
- **Rate limiting**: Protect LLM and embedding endpoints.
- **Local embeddings**: Use sentence-transformers for on-prem, embedding-free dedup fallback.
- **Database**: For higher load, switch `database_url` to PostgreSQL; schema is SQLAlchemy ORM.

---

## 10. Security Considerations

### Implemented

- **CSV filenames**: `sanitize_feature_name()` prevents path traversal; no raw user input in filenames.
- **Route order**: `/csv-filename` defined before `/{test_case_id}` to avoid UUID matching issues.
- **Pydantic validation**: Request bodies validated; malformed input rejected.

### Not Implemented

- **Authentication**: No auth; API is open.
- **Authorization**: No RBAC.
- **API key**: `api_key_header_name` in config is unused.
- **Secrets**: API keys (OpenAI, Gemini, Groq) from env; ensure `.env` is not committed.

### Recommendations

- Add API key or OAuth for production.
- Rate limit per client to reduce abuse.
- Validate/sanitize LLM output before storage (already done via Pydantic + `_clean_test_case_data`).
- Use secrets management for API keys (OpenAI, Gemini, Groq) in production.
