/**
 * Dedicated API client for test case generation.
 * All backend calls go through this module; no fetch in components.
 */

import type {
  GenerateTestCasesRequest,
  TestCaseListResponse,
} from "./types";

const getBaseUrl = (): string => {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (base) return base.replace(/\/$/, "");
  return ""; // use relative URLs when proxying (e.g. /api)
};

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

  if (!res.ok) {
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

  const data: TestCaseListResponse = await res.json();
  return data;
}
