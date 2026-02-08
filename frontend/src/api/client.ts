/**
 * Dedicated API client for test case generation.
 * All backend calls go through this module; no fetch in components.
 */

import type {
  BatchGenerateRequest,
  BatchGenerateResponse,
  BatchStatusResponse,
  GenerateTestCasesRequest,
  TestCaseListResponse,
} from "./types";

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
