# Architecture & Reference

Project overview, architecture, API reference, and technical notes. For setup and running the app, see [local-development.md](local-development.md) and [deployment.md](deployment.md).

---

## 1. Project Overview

### Purpose

QAMP is a personal QA application that combines **AI-powered test case generation** with **persistent test management**. It produces structured test cases from feature descriptions using LLMs (Ollama, OpenAI, Gemini, or Groq), and stores them in **SQLite** under **projects** and **modules**. You can run executions (status + actual result) in a table UI and track history. The system supports single-feature and batch generation, scenario-driven coverage, deduplication, CSV/Excel export, **Save to Project**, and **execution tracking** with a dashboard.

### Problems It Solves

- **Manual effort**: Reduces time writing test cases from requirements.
- **Coverage gaps**: Uses coverage dimensions (core, validation, negative, boundary, state, security, destructive) to guide scenarios.
- **Duplication**: Embedding-based and title-based deduplication.
- **Inconsistency**: Standardized structure (scenario, description, preconditions, steps, expected results).
- **Export**: CSV (per-feature and merged) and Excel template merge.
- **Persistence**: Projects/modules (SQLite), execution status and history, dashboard stats.

### Target Users

- QA engineers generating and organizing test cases from specs
- Developers doing exploratory test design and execution tracking
- Teams using local (Ollama) or cloud (OpenAI, Gemini, Groq) LLMs with persistent storage

---

## 2. Architecture

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite, React Router)                  │
│  /  Generator   │  /projects   │  /projects/:id   │  /dashboard             │
│  GenerationForm │  ProjectList │  ModuleTree      │  PersonalDashboard      │
│  BatchResultsView│  ProjectForm│  ExecutionTable  │  (stats, recent activity)│
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
│         ▼          ┌─────────────────────────────────────────────────────┐  │
│  ┌─────────────┐   │ database: SQLAlchemy (SQLite)                        │  │
│  │ app.database│   │ Project, Module, TestCase, TestExecution             │  │
│  │ connection  │   └─────────────────────────────────────────────────────┘  │
│  └─────────────┘                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  External: Ollama, OpenAI API, Gemini, Groq, SQLite (testcases.db)           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| **API** | `app.api.health` | Liveness/readiness |
| **API** | `app.api.testcases` | AI generation, batch, export; save-to-project; modules testcases; execute; execute-batch; executions; delete DB case |
| **API** | `app.api.projects` | CRUD projects; project + module tree |
| **API** | `app.api.modules` | CRUD modules; module tree |
| **Database** | `app.database.connection` | SQLAlchemy engine (SQLite), SessionLocal, get_db, init_db |
| **Database** | `app.database.models` | Project, Module, TestCase, TestExecution (ORM) |
| **Service** | `TestCaseService` | AI generation, batch orchestration, in-memory batch/store, dedup |
| **Providers** | Ollama, OpenAI, Gemini, Groq | LLM calls; `LLMProvider` interface |
| **Utils** | prompt_builder, embeddings, token_allocation, csv_filename, excel_* | Prompts, dedup, exports, Excel merge |

### External Services

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Ollama** | Local LLM | `AI_TC_GEN_OLLAMA_BASE_URL`, `AI_TC_GEN_OLLAMA_MODEL` |
| **OpenAI** | Chat + embeddings | `AI_TC_GEN_OPENAI_API_KEY`, `AI_TC_GEN_OPENAI_MODEL` |
| **Gemini** | Cloud LLM | `AI_TC_GEN_GEMINI_API_KEY`, `AI_TC_GEN_GEMINI_MODEL` |
| **Groq** | Cloud LLM | `AI_TC_GEN_GROQ_API_KEY`, `AI_TC_GEN_GROQ_MODEL` |

---

## 3. Tech Stack

- **Backend:** Python 3.x, FastAPI, Pydantic, SQLAlchemy, uvicorn
- **Frontend:** TypeScript, React 18, Vite 5, React Router, Tailwind CSS
- **Key libs:** httpx, openai, google-genai, groq, tiktoken, openpyxl (backend); lucide-react (frontend)

---

## 4. Folder Structure

```
qamp/
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI app, init_db
│   │   ├── api/             # health, testcases, projects, modules
│   │   ├── core/            # config, logging
│   │   ├── database/        # connection, models
│   │   ├── schemas/         # testcase, project (Pydantic)
│   │   ├── services/        # testcase_service (AI, batch, dedup)
│   │   ├── providers/       # ollama, openai, gemini, groq
│   │   └── utils/           # prompt_builder, embeddings, excel_*, etc.
│   ├── tests/
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/             # client.ts, auth, types
│       └── components/      # Generator, ProjectManagement, TestExecution, Dashboard
├── .env                     # Backend env (project root)
├── docs/
└── package.json
```

---

## 5. API Reference

Base URL: `http://localhost:8000` (or your host). OpenAPI: `http://localhost:8000/docs`.

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness/readiness |

### Test Cases (AI & in-memory)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/testcases/generate-test-cases` | Generate via LLM |
| POST | `/api/testcases/batch-generate` | Start batch; returns `batch_id` |
| GET | `/api/testcases/batches/{batch_id}` | Batch status and results |
| POST | `/api/testcases/batches/{batch_id}/features/{feature_id}/retry` | Retry failed feature |
| GET | `/api/testcases/batches/{batch_id}/export-all` | Merged CSV download |
| POST | `/api/testcases/export-to-excel` | Export to Excel template (single feature). Multipart: `template`, `testCases`, `featureName`. |
| POST | `/api/testcases/export-all-to-excel` | Export all to Excel template. Multipart: `template`, `testCasesByFeature`. |
| DELETE | `/api/testcases/{id}` | Delete in-memory case |
| GET | `/api/testcases/csv-filename?feature_name=` | OS-safe filename |

### Projects & Modules

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/projects` | Create project |
| GET | `/api/projects` | List projects (with module counts) |
| GET | `/api/projects/{id}` | Project + module tree |
| PUT | `/api/projects/{id}` | Update project |
| DELETE | `/api/projects/{id}` | Delete project (cascade) |
| POST | `/api/projects/{project_id}/modules` | Create module (name, optional parent_id) |
| GET | `/api/projects/{project_id}/modules` | Module tree |
| PUT | `/api/modules/{id}` | Update module |
| DELETE | `/api/modules/{id}` | Delete module (cascade) |

### Persistent Test Cases & Execution

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/testcases/save-to-project` | Bulk save into module (body: `module_id`, `test_cases[]`) |
| GET | `/api/testcases/modules/{module_id}/testcases` | List test cases in module (with latest execution) |
| POST | `/api/testcases/modules/{module_id}/execute-batch` | Batch record executions (body: `executions[]`) |
| GET | `/api/testcases/{id}/executions` | Execution history |
| DELETE | `/api/testcases/db/{id}` | Delete persisted test case |
| POST | `/api/testcases/modules/{module_id}/export-to-excel-template` | Export module to Excel. Multipart: `template`. |
| POST | `/api/testcases/modules/export-to-excel-template-combined` | Export selected modules. Multipart: `template`, `module_ids`. |

### Dashboard

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard` | Aggregate stats, recent activity |

### Key Schemas

- **GenerateTestCasesRequest:** `feature_name`, `feature_description`, `coverage_level` (low|medium|high|comprehensive), optional `provider`, `model_id`
- **BatchGenerateRequest:** optional `provider`, `model_id`, `features[]`
- **Persistent QA:** See `app.schemas.project` (ProjectCreate/Response, ModuleCreate/Response, TestCaseSave, TestExecutionUpdate, BatchExecutionUpdate)

---

## 6. Usage Notes

### Batch (UI)

1. Open Generator (`/`). Add feature tabs (name, description, coverage).
2. Choose model. Click **Generate Test Cases**. Polling shows status.
3. Export: per-feature CSV, Export All CSV, Export to Excel Template (per feature or all).
4. **Save to Project** to bulk-save into a project/module.

### Projects & Modules

1. **Projects** (`/projects`): Create/edit projects.
2. **Project detail** (`/projects/:id`): Module tree (left); **+ New Module**; select module → execution table (right).
3. **Execution table:** Status button (Not Executed → Passed → Failed → Blocked), Actual Result, **Save All Changes**, **View** (detail + history), Export (CSV, Excel, ZIP).

### Excel Template Merge

- **Generator:** Template must have sheet **"Test Cases"**; headers in rows 1–2; data from row 3. Summary sheet unchanged.
- **Execution table:** Auto-detects headers (row 1 or 2 per sheet); fallback multi-row → single-row. Max 10 MB `.xlsx`.

---

## 7. Testing

- **Health:** `backend/tests/test_health.py`
- **Run:** From project root, `cd backend && python -m pytest tests/ -v` (use venv Python if not activated).

---

## 8. Scalability

- **SQLite:** Single file; suitable for personal/small team. For higher load, switch `database_url` to PostgreSQL.
- **In-memory batch:** Batch state is process-local; use **Save to Project** to persist. No horizontal scaling of batch jobs today.
- **Embeddings:** OpenAI API; consider caching or local embeddings for cost/latency.

---

## 9. Security

- **Implemented:** CSV filename sanitization; Pydantic validation; route ordering to avoid ID collisions.
- **Auth:** Optional basic auth via `AI_TC_GEN_AUTH_USERNAME` / `AI_TC_GEN_AUTH_PASSWORD`; JWT for API. Do not commit `.env`.
- **Recommendations:** Rate limiting; secrets management for API keys; HTTPS in production.
