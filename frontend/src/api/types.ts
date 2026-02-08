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
  /** Backend uses this to choose gpt-4o-mini (fast) vs gpt-4o (smart) when provider is OpenAI. */
  model_profile?: ModelProfile;
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

// --- Batch ---

export type FeatureResultStatus = "pending" | "generating" | "completed" | "failed";

export interface FeatureConfigPayload {
  feature_name: string;
  feature_description: string;
  allowed_actions?: string;
  excluded_features?: string;
  coverage_level: CoverageLevel;
}

export interface BatchGenerateRequest {
  provider?: ApiProvider;
  /** fast = gpt-4o-mini, smart = gpt-4o when provider is OpenAI. */
  model_profile?: ModelProfile;
  features: FeatureConfigPayload[];
}

export interface BatchGenerateResponse {
  batch_id: string;
}

export interface BatchFeatureResult {
  feature_id: string;
  feature_name: string;
  status: FeatureResultStatus;
  items?: TestCaseItem[] | null;
  error?: string | null;
}

export interface BatchStatusResponse {
  batch_id: string;
  status: "pending" | "running" | "completed" | "partial";
  features: BatchFeatureResult[];
}
