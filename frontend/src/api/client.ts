/**
 * Dedicated API client for test case generation.
 * All backend calls go through this module; no fetch in components.
 */

import type {
  BatchGenerateRequest,
  BatchGenerateResponse,
  BatchStatusResponse,
  GenerateTestCasesRequest,
  TestCaseItem,
  TestCaseListResponse,
} from "./types";

/** Payload shape for export-to-excel: camelCase keys and testSteps as pipe-separated string. */
export interface ExportToExcelTestCase {
  testScenario: string;
  description: string;
  precondition: string;
  testData: string;
  testSteps: string;
  expectedResult: string;
}

export function itemToExportPayload(item: TestCaseItem): ExportToExcelTestCase {
  return {
    testScenario: item.test_scenario ?? "",
    description: item.test_description ?? "",
    precondition: item.pre_condition ?? "",
    testData: item.test_data ?? "",
    testSteps: Array.isArray(item.test_steps) ? item.test_steps.join(" | ") : String(item.test_steps ?? ""),
    expectedResult: item.expected_result ?? "",
  };
}

const getBaseUrl = (): string => {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (base) return base.replace(/\/$/, "");
  return ""; // use relative URLs when proxying (e.g. /api)
};

async function handleError(res: Response): Promise<never> {
  const body = await res.text();
  let message = `Request failed (${res.status})`;
  try {
    const json = JSON.parse(body);
    if (typeof json.detail === "string") message = json.detail;
    else if (Array.isArray(json.detail)) message = json.detail.map((d: { msg?: string }) => d.msg ?? "").join("; ");
  } catch {
    if (body) message = body.slice(0, 200);
  }
  throw new Error(message);
}

export async function generateTestCases(
  payload: GenerateTestCasesRequest
): Promise<TestCaseListResponse> {
  const base = getBaseUrl();
  const url = `${base}/api/testcases/generate-test-cases`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) await handleError(res);
  return res.json();
}

// --- Batch ---

export async function batchGenerate(
  payload: BatchGenerateRequest
): Promise<BatchGenerateResponse> {
  const base = getBaseUrl();
  const url = `${base}/api/testcases/batch-generate`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function getBatchStatus(
  batchId: string
): Promise<BatchStatusResponse> {
  const base = getBaseUrl();
  const url = `${base}/api/testcases/batches/${encodeURIComponent(batchId)}`;
  const res = await fetch(url);
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function retryBatchFeature(
  batchId: string,
  featureId: string,
  provider?: string
): Promise<void> {
  const base = getBaseUrl();
  const q = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  const url = `${base}/api/testcases/batches/${encodeURIComponent(batchId)}/features/${encodeURIComponent(featureId)}/retry${q}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) await handleError(res);
}

/** Delete a test case. It is removed from the batch and excluded from all CSV exports. */
export async function deleteTestCase(testCaseId: string): Promise<void> {
  const base = getBaseUrl();
  const url = `${base}/api/testcases/${encodeURIComponent(testCaseId)}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) await handleError(res);
}

/** Returns the URL to download merged (deduped) CSV for the batch. Backend sets filename via Content-Disposition. */
export function getBatchExportAllUrl(batchId: string): string {
  const base = getBaseUrl();
  return `${base}/api/testcases/batches/${encodeURIComponent(batchId)}/export-all`;
}

/** Get a unique OS-safe CSV filename from the backend (for single-feature export). */
export async function getCsvFilename(featureName?: string): Promise<string> {
  const base = getBaseUrl();
  const q = featureName != null && featureName !== "" ? `?feature_name=${encodeURIComponent(featureName)}` : "";
  const url = `${base}/api/testcases/csv-filename${q}`;
  const res = await fetch(url);
  if (!res.ok) await handleError(res);
  const json = (await res.json()) as { filename: string };
  return json.filename ?? "tc_export.csv";
}

/**
 * Export filtered test cases into an Excel template. Sends template file + JSON to backend,
 * then triggers download of the merged Excel file.
 */
export async function exportToExcelTemplate(
  templateFile: File,
  testCases: TestCaseItem[],
  featureName: string
): Promise<void> {
  const base = getBaseUrl();
  const url = `${base}/api/testcases/export-to-excel`;
  const form = new FormData();
  form.append("template", templateFile);
  form.append("testCases", JSON.stringify(testCases.map(itemToExportPayload)));
  form.append("featureName", featureName);

  const res = await fetch(url, {
    method: "POST",
    body: form,
  });
  if (!res.ok) await handleError(res);

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  let filename = `${featureName.replace(/[^\w\s-]/g, "_").replace(/\s+/g, "_")}_Test_Cases.xlsx`;
  if (disposition) {
    const match = /filename[*]?=(?:UTF-8'')?["']?([^"'\s;]+)["']?/.exec(disposition);
    if (match?.[1]) filename = match[1].trim();
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Payload for export-all: one entry per feature with test cases. */
export interface ExportAllFeaturePayload {
  featureName: string;
  testCases: ExportToExcelTestCase[];
}

/**
 * Export all features' test cases into one Excel template (one sheet per feature).
 */
export async function exportAllToExcelTemplate(
  templateFile: File,
  featuresData: ExportAllFeaturePayload[]
): Promise<void> {
  const base = getBaseUrl();
  const url = `${base}/api/testcases/export-all-to-excel`;
  const form = new FormData();
  form.append("template", templateFile);
  form.append("testCasesByFeature", JSON.stringify(featuresData));

  const res = await fetch(url, {
    method: "POST",
    body: form,
  });
  if (!res.ok) await handleError(res);

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  // Fallback filename if backend does not provide one; include local date + time (HHmm)
  // for uniqueness, e.g. All_Features_Test_Cases_2025-01-10_1432.xlsx.
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const fallbackTimestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  let filename = `All_Features_Test_Cases_${fallbackTimestamp}.xlsx`;
  if (disposition) {
    const match = /filename[*]?=(?:UTF-8'')?["']?([^"'\s;]+)["']?/.exec(disposition);
    if (match?.[1]) filename = match[1].trim();
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- Persistent QA platform APIs ---

export interface ProjectCreate {
  name: string;
  description?: string;
}

export interface ProjectResponse {
  id: number;
  name: string;
  description?: string | null;
  created_at: string;
  modules_count: number;
  test_cases_count?: number;
  status?: string;
}

export interface ModuleExecutionStats {
  executed: number;
  passed: number;
  failed: number;
  blocked: number;
  not_executed: number;
  total: number;
}

export interface ModuleResponse {
  id: number;
  project_id: number;
  name: string;
  parent_id?: number | null;
  status?: string;
  execution_status?: string;
  execution_stats?: ModuleExecutionStats | null;
  created_at: string;
  test_cases_count: number;
  children: ModuleResponse[];
}

export interface TestExecutionResponse {
  id: number;
  test_case_id: number;
  status: string;
  actual_result?: string | null;
  notes?: string | null;
  executed_at: string;
}

export interface ModuleTestCaseWithLatestExecution {
  id: number;
  module_id: number;
  test_id: string;
  scenario: string;
  description: string;
  preconditions: string;
  test_data?: string | null;
  steps: string[];
  expected_result: string;
  priority?: string | null;
  tags?: string | null;
  created_at: string;
  latest_execution?: TestExecutionResponse | null;
}

export interface TestCaseSaveItem {
  test_id: string;
  scenario: string;
  description: string;
  preconditions: string;
  steps: string[];
  expected_result: string;
  test_data?: string;
  priority?: string;
  tags?: string;
}

export interface DashboardActivityItem {
  test_id: string;
  scenario: string;
  status: string;
  executed_at: string;
}

export interface DashboardStats {
  total_cases: number;
  total_executed: number;
  total_passed: number;
  recent_activity: DashboardActivityItem[];
}

export interface ModuleExecutionRow {
  project_id: number;
  module_id: number;
  project_module: string;
  passed: number;
  failed: number;
  blocked: number;
  not_executed: number;
}

export interface DashboardData {
  total_projects: number;
  total_modules: number;
  total_test_cases: number;
  overall_completion_percentage: number;
  modules_with_stats: ModuleExecutionRow[];
  project_status_distribution: { to_do: number; in_progress: number; completed: number };
  module_status_distribution: { to_do: number; in_progress: number; completed: number };
  project_list: { id: number; name: string; modules_count: number; test_cases_count: number; status: string }[];
  recent_activities: { type: string; description: string; timestamp: string }[];
}

export async function createProject(payload: ProjectCreate): Promise<ProjectResponse> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function getProjects(): Promise<ProjectResponse[]> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/projects`);
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function getProject(
  id: number
): Promise<{ project: ProjectResponse; modules: ModuleResponse[] }> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/projects/${id}`);
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function updateProject(
  id: number,
  payload: ProjectCreate
): Promise<ProjectResponse> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function deleteProject(id: number): Promise<void> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/projects/${id}`, { method: "DELETE" });
  if (!res.ok) await handleError(res);
}

export async function createModule(
  projectId: number,
  payload: { name: string; parent_id?: number | null }
): Promise<ModuleResponse> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/projects/${projectId}/modules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function getModules(projectId: number): Promise<ModuleResponse[]> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/projects/${projectId}/modules`);
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function updateModule(
  moduleId: number,
  payload: { name: string; parent_id?: number | null }
): Promise<ModuleResponse> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/modules/${moduleId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function updateModuleStatus(
  moduleId: number,
  status: string
): Promise<{ id: number; status: string }> {
  const base = getBaseUrl();
  const res = await fetch(
    `${base}/api/modules/${moduleId}/status?status=${encodeURIComponent(status)}`,
    { method: "PUT" }
  );
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function deleteModule(moduleId: number): Promise<void> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/modules/${moduleId}`, { method: "DELETE" });
  if (!res.ok) await handleError(res);
}

export interface ImportResult {
  imported_modules: { file?: string; module_name: string; test_cases_count: number; sheet_used?: string; warnings?: string[] }[];
  errors: { file?: string; error?: string }[];
  total_imported?: number;
}

export async function importFromFile(
  projectId: number,
  files: File[],
  moduleNames?: Record<string, string>,
  headerRows?: Record<string, number>
): Promise<ImportResult> {
  const base = getBaseUrl();
  const form = new FormData();
  form.append("project_id", String(projectId));
  form.append("module_names", JSON.stringify(moduleNames ?? {}));
  form.append("header_rows", JSON.stringify(headerRows ?? {}));
  for (const f of files) {
    form.append("files", f);
  }
  const res = await fetch(`${base}/api/testcases/import-from-file`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export interface ImportPreviewResult {
  filename: string;
  needs_user_input?: boolean;
  row1_preview?: string[];
  row2_preview?: string[];
  row3_preview?: string[];
  test_cases_count?: number;
  column_map?: Record<string, string>;
  sheet_used?: string;
  header_format?: string;
  warnings?: string[];
  preview?: unknown[];
}

export async function importPreview(
  file: File,
  headerRow?: number
): Promise<ImportPreviewResult> {
  const base = getBaseUrl();
  const form = new FormData();
  form.append("file", file);
  if (headerRow != null) {
    form.append("header_row", String(headerRow));
  }
  const res = await fetch(`${base}/api/testcases/import-preview`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function saveTestCasesToProject(
  moduleId: number,
  testCases: TestCaseSaveItem[]
): Promise<void> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/testcases/save-to-project`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ module_id: moduleId, test_cases: testCases }),
  });
  if (!res.ok) await handleError(res);
}

export async function getTestCasesByModule(
  moduleId: number
): Promise<ModuleTestCaseWithLatestExecution[]> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/testcases/modules/${moduleId}/testcases`);
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function executeBatch(
  moduleId: number,
  executions: { testCaseId: number; status: string; actualResult?: string; notes?: string }[]
): Promise<void> {
  const base = getBaseUrl();
  const payload = {
    executions: executions.map((e) => ({
      test_case_id: e.testCaseId,
      status: e.status,
      actual_result: e.actualResult ?? null,
      notes: e.notes ?? null,
    })),
  };
  const res = await fetch(`${base}/api/testcases/modules/${moduleId}/execute-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await handleError(res);
}

export async function getExecutionHistory(
  testCaseId: number
): Promise<TestExecutionResponse[]> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/testcases/${testCaseId}/executions`);
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function deletePersistedTestCase(id: number): Promise<void> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/testcases/db/${id}`, { method: "DELETE" });
  if (!res.ok) await handleError(res);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/dashboard`);
  if (!res.ok) await handleError(res);
  return res.json();
}

export async function getDashboardData(): Promise<DashboardData> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/dashboard`);
  if (!res.ok) await handleError(res);
  const data = await res.json();
  // Backend uses snake_case keys
  return {
    ...data,
    modules_with_stats: data.modules_with_stats ?? [],
    project_status_distribution: data.project_status_distribution || { to_do: 0, in_progress: 0, completed: 0 },
    module_status_distribution: data.module_status_distribution || { to_do: 0, in_progress: 0, completed: 0 },
  };
}

// --- Test Execution Export APIs ---

async function downloadBlob(
  url: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ blob: Blob; filename: string }> {
  const opts: RequestInit = {
    method,
    headers: headers ?? {},
  };
  if (body != null && method === "POST") {
    opts.headers = {
      ...opts.headers,
      "Content-Type": "application/json",
    } as HeadersInit;
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) await handleError(res);
  const blob = await res.blob();
  let filename = "download";
  const disposition = res.headers.get("Content-Disposition");
  if (disposition) {
    const match = /filename[*]?=(?:UTF-8'')?["']?([^"'\s;]+)["']?/.exec(disposition);
    if (match?.[1]) filename = match[1].trim();
  }
  return { blob, filename };
}

function triggerDownload(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function exportModuleToCsv(moduleId: number): Promise<void> {
  const base = getBaseUrl();
  const { blob, filename } = await downloadBlob(
    `${base}/api/testcases/modules/${moduleId}/export-csv`,
    "POST"
  );
  triggerDownload(blob, filename);
}

export async function exportCombinedModulesToCsv(
  moduleIds: number[]
): Promise<void> {
  const base = getBaseUrl();
  const { blob, filename } = await downloadBlob(
    `${base}/api/testcases/modules/export-csv-combined`,
    "POST",
    { module_ids: moduleIds }
  );
  triggerDownload(blob, filename);
}

export async function exportAllModulesAsZip(projectId: number): Promise<void> {
  const base = getBaseUrl();
  const { blob, filename } = await downloadBlob(
    `${base}/api/testcases/projects/${projectId}/export-all-modules-zip`,
    "POST"
  );
  triggerDownload(blob, filename);
}

/** Export single module to Excel (no template). Backend tries multi-row, falls back to single-row on error. */
export async function exportModuleToExcel(moduleId: number): Promise<void> {
  const base = getBaseUrl();
  const { blob, filename } = await downloadBlob(
    `${base}/api/testcases/modules/${moduleId}/export-excel`,
    "GET"
  );
  triggerDownload(blob, filename);
}

/** Export selected modules to one Excel file (no template). Backend tries multi-row, falls back to single-row on error. */
export async function exportCombinedModulesToExcel(
  moduleIds: number[]
): Promise<void> {
  const base = getBaseUrl();
  const url = `${base}/api/testcases/modules/export-excel-combined`;
  const form = new FormData();
  form.append("module_ids", JSON.stringify(moduleIds));

  const res = await fetch(url, {
    method: "POST",
    body: form,
  });
  if (!res.ok) await handleError(res);

  const blob = await res.blob();
  let filename = "TestCases_Multiple_Modules.xlsx";
  const disposition = res.headers.get("Content-Disposition");
  if (disposition) {
    const match = /filename[*]?=(?:UTF-8'')?["']?([^"'\s;]+)["']?/.exec(disposition);
    if (match?.[1]) filename = match[1].trim();
  }
  triggerDownload(blob, filename);
}

export async function exportCombinedModulesToExcelTemplate(
  templateFile: File,
  moduleIds: number[]
): Promise<void> {
  const base = getBaseUrl();
  const url = `${base}/api/testcases/modules/export-to-excel-template-combined`;
  const form = new FormData();
  form.append("template", templateFile);
  form.append("module_ids", JSON.stringify(moduleIds));

  const res = await fetch(url, {
    method: "POST",
    body: form,
  });
  if (!res.ok) await handleError(res);

  const blob = await res.blob();
  let filename = "combined_test_cases.xlsx";
  const disposition = res.headers.get("Content-Disposition");
  if (disposition) {
    const match = /filename[*]?=(?:UTF-8'')?["']?([^"'\s;]+)["']?/.exec(disposition);
    if (match?.[1]) filename = match[1].trim();
  }
  triggerDownload(blob, filename);
}

export async function exportModuleToExcelTemplate(
  moduleId: number,
  templateFile: File
): Promise<void> {
  const base = getBaseUrl();
  const url = `${base}/api/testcases/modules/${moduleId}/export-to-excel-template`;
  const form = new FormData();
  form.append("template", templateFile);

  const res = await fetch(url, {
    method: "POST",
    body: form,
  });
  if (!res.ok) await handleError(res);

  const blob = await res.blob();
  let filename = "export.xlsx";
  const disposition = res.headers.get("Content-Disposition");
  if (disposition) {
    const match = /filename[*]?=(?:UTF-8'')?["']?([^"'\s;]+)["']?/.exec(disposition);
    if (match?.[1]) filename = match[1].trim();
  }
  triggerDownload(blob, filename);
}
