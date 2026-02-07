/**
 * API request/response types aligned with backend schemas.
 * No prompt, provider, or token details exposed to the UI.
 */

export type CoverageLevel = "low" | "medium" | "high" | "comprehensive";

/** UI-only: Fast/Smart use OpenAI, Private uses Ollama. Never expose provider names in labels. */
export type ModelProfile = "fast" | "smart" | "private";

/** Backend request: uses provider, not model_profile. */
export type ApiProvider = "ollama" | "openai";

export interface GenerateTestCasesRequest {
  feature_name: string;
  feature_description: string;
  coverage_level: CoverageLevel;
  /** Backend uses this to choose Ollama vs OpenAI. */
  provider?: ApiProvider;
}

export interface TestCaseItem {
  id: string;
  test_scenario: string;
  test_description: string;
  pre_condition: string;
  test_data: string;
  test_steps: string[];
  expected_result: string;
  created_at: string;
  created_by: string | null;
}

export interface TestCaseListResponse {
  items: TestCaseItem[];
  total: number;
}
