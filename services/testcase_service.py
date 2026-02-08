from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional, Sequence
from uuid import UUID, uuid4

from core.config import get_settings
from providers.base import LLMProvider
from providers.factory import get_provider
from schemas.testcase import (
    BatchFeatureResult,
    BatchStatusResponse,
    FeatureConfig,
    FeatureResultStatus,
    GenerateTestCasesRequest,
    TestCase,
    TestCaseGenerationRequest,
    TestCaseResponse,
)
from utils.embeddings import (
    deduplicate_indices_by_embeddings,
    deduplicate_scenarios,
)
from utils.prompt_builder import (
    build_scenario_extraction_prompt,
    build_test_expansion_prompt,
)


logger = logging.getLogger(__name__)


@dataclass
class _FeatureResultState:
    feature_id: str
    feature_name: str
    status: FeatureResultStatus
    items: List[TestCase] = field(default_factory=list)
    error: Optional[str] = None


@dataclass
class _BatchState:
    batch_id: str
    status: Literal["pending", "running", "completed", "partial"]
    features: Dict[str, _FeatureResultState] = field(default_factory=dict)
    provider: Optional[str] = None
    model_profile: Optional[str] = None
    config_by_feature_id: Dict[str, FeatureConfig] = field(default_factory=dict)


# Coverage dimensions (scenario-driven). Higher coverage includes all lower dimensions.
LAYER_FOCUS: Dict[str, str] = {
    "core": (
        "Fundamental workflows, happy paths, and required validations. "
        "Highest priority: never skip basic flows or mandatory checks."
    ),
    "validation": (
        "Field validation, required inputs, format errors, and user input mistakes. "
        "Do not duplicate core flows."
    ),
    "negative": (
        "Invalid inputs, error paths, rejection cases, and user mistakes. "
        "Each independent failure mode is its own scenario."
    ),
    "boundary": (
        "Boundary values, unusual inputs, limits, and edge values. "
        "Do not duplicate core, validation, or negative scenarios."
    ),
    "state": (
        "State transitions, multi-step flows, and state-dependent behavior. "
        "Do not duplicate earlier dimensions."
    ),
    "security": (
        "Security-related scenarios: auth, authorization, injection, sensitive data. "
        "Do not duplicate earlier dimensions."
    ),
    "destructive": (
        "Data corruption, conflicting operations, resilience failures, and recovery. "
        "Do not duplicate earlier dimensions."
    ),
}

# Which dimensions run per coverage_level (cumulative). Order matters.
COVERAGE_LEVEL_LAYERS: Dict[str, tuple[str, ...]] = {
    "low": ("core",),
    "medium": ("core", "validation", "negative"),
    "high": ("core", "validation", "negative", "boundary", "state"),
    "comprehensive": (
        "core",
        "validation",
        "negative",
        "boundary",
        "state",
        "security",
        "destructive",
    ),
}

# Safety floor: if the LLM returns fewer scenarios than this for a layer, re-prompt for expansion.
# No cap on maximum.
MIN_SCENARIOS_PER_LAYER: Dict[str, int] = {
    "core": 5,
    "validation": 6,
    "negative": 6,
    "boundary": 8,
    "state": 6,
    "security": 6,
    "destructive": 6,
}

# Embedding deduplication threshold (cosine similarity). Above this, treat as duplicate.
EMBEDDING_DEDUP_THRESHOLD: float = 0.90

# Scenario-level semantic dedup: same threshold; applied after each layer's scenario extraction.
SCENARIO_DEDUP_THRESHOLD: float = 0.90


class TestCaseService:
    """
    Application service responsible for generating and managing test cases.

    Business logic is concentrated here to keep route handlers thin.
    LLM calls go through the provider abstraction (Ollama or OpenAI).
    """

    def __init__(self) -> None:
        self._store: Dict[UUID, TestCase] = {}
        self._batch_store: Dict[str, _BatchState] = {}

    @staticmethod
    def _extract_json_object(raw_output: str) -> str:
        """
        Best-effort extraction of the JSON object from an LLM response.

        Some models may wrap the JSON with markdown fences or short prose
        despite strict instructions. To make the system more robust, we:
        - Strip leading/trailing whitespace.
        - Take the substring from the first '{' to the last '}' if both exist.
        """
        text = raw_output.strip()
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return text
        return text[start : end + 1]

    @staticmethod
    def _existing_cases_to_json(cases: Sequence[TestCase]) -> str:
        """Serialize existing test cases to a minimal JSON string for the prompt (duplicate prevention)."""
        if not cases:
            return ""
        minimal = [
            {
                "test_scenario": tc.test_scenario,
                "test_description": tc.test_description,
                "test_steps": tc.test_steps,
            }
            for tc in cases
        ]
        return json.dumps(minimal, indent=2)

    @staticmethod
    def _normalize_title(title: str) -> str:
        """Normalize title for similarity comparison."""
        s = re.sub(r"\s+", " ", title.lower().strip())
        return s

    @staticmethod
    def _remove_near_duplicate_titles(cases: List[TestCase]) -> List[TestCase]:
        """
        Remove redundant cases when titles are near-duplicates (exact or one contains the other).
        Preserve the most detailed version (longer steps + expected_result).
        """
        if len(cases) <= 1:
            return cases
        result: List[TestCase] = []
        for tc in cases:
            key = TestCaseService._normalize_title(tc.test_scenario)
            detail = len(" ".join(tc.test_steps)) + len(tc.expected_result)
            found = False
            for i, existing in enumerate(result):
                existing_key = TestCaseService._normalize_title(existing.test_scenario)
                if key == existing_key or key in existing_key or existing_key in key:
                    existing_detail = len(" ".join(existing.test_steps)) + len(existing.expected_result)
                    if detail > existing_detail:
                        result[i] = tc
                    found = True
                    break
            if not found:
                result.append(tc)
        return result

    async def _extract_scenarios(
        self,
        provider: LLMProvider,
        user_instructions: str,
        layer: str,
        coverage_level: str,
        model_profile: Optional[str],
        existing_scenarios: Optional[List[str]] = None,
        expansion_request: Optional[str] = None,
    ) -> List[str]:
        """
        PASS 1 — Scenario extraction. Ask the LLM to list all distinct scenarios for the layer.
        If fewer than MIN_SCENARIOS_PER_LAYER, re-prompt once for expansion.
        """
        focus = LAYER_FOCUS.get(layer, LAYER_FOCUS["core"])
        min_hint = MIN_SCENARIOS_PER_LAYER.get(layer)
        existing_json = json.dumps(existing_scenarios, indent=2) if existing_scenarios else None

        prompt = build_scenario_extraction_prompt(
            user_instructions=user_instructions,
            layer=layer,
            layer_focus=focus,
            existing_scenarios_json=existing_json,
            min_scenarios_hint=min_hint,
            expansion_request=expansion_request,
        )
        raw_output = await provider.generate_test_cases(
            prompt,
            coverage_level=coverage_level,
            model_profile=model_profile,
        )
        try:
            cleaned = self._extract_json_object(raw_output)
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.error(
                "Failed to parse scenario JSON for layer %s: %s",
                layer,
                exc,
                extra={"raw_preview": raw_output[:500]},
            )
            raise
        if not isinstance(parsed, dict):
            raise ValueError("LLM output must be a JSON object with a 'scenarios' field")
        raw_scenarios = parsed.get("scenarios")
        if not isinstance(raw_scenarios, list):
            raise ValueError("LLM output 'scenarios' field must be a JSON array")
        scenarios = [str(s).strip() for s in raw_scenarios if s]
        if not scenarios:
            raise ValueError("LLM returned no scenarios")

        min_required = MIN_SCENARIOS_PER_LAYER.get(layer)
        if min_required is not None and len(scenarios) < min_required and not expansion_request:
            expansion_request = (
                f"You returned {len(scenarios)} scenarios. We need at least {min_required} distinct scenarios "
                f"for this dimension. List more distinct scenarios; do not merge or summarize."
            )
            logger.info(
                "Re-prompting for more scenarios: layer=%s current=%s min=%s",
                layer,
                len(scenarios),
                min_required,
            )
            return await self._extract_scenarios(
                provider=provider,
                user_instructions=user_instructions,
                layer=layer,
                coverage_level=coverage_level,
                model_profile=model_profile,
                existing_scenarios=scenarios,
                expansion_request=expansion_request,
            )
        return scenarios

    async def _expand_scenarios_to_tests(
        self,
        provider: LLMProvider,
        user_instructions: str,
        layer: str,
        scenarios: List[str],
        existing_cases: List[TestCase],
        coverage_level: str,
        model_profile: Optional[str],
    ) -> List[TestCase]:
        """
        PASS 2 — Test case expansion. Convert each scenario into one or more test cases.
        Minimum one test per scenario; add more when variations are needed.
        """
        if not scenarios:
            return []
        focus = LAYER_FOCUS.get(layer, LAYER_FOCUS["core"])
        existing_json = self._existing_cases_to_json(existing_cases) if existing_cases else None

        prompt = build_test_expansion_prompt(
            user_instructions=user_instructions,
            layer=layer,
            layer_focus=focus,
            scenarios=scenarios,
            existing_test_cases_json=existing_json,
        )
        raw_output = await provider.generate_test_cases(
            prompt,
            coverage_level=coverage_level,
            model_profile=model_profile,
        )
        try:
            cleaned = self._extract_json_object(raw_output)
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.error(
                "Failed to parse test expansion JSON for layer %s: %s",
                layer,
                exc,
                extra={"raw_preview": raw_output[:500]},
            )
            raise
        if not isinstance(parsed, dict):
            raise ValueError("LLM output must be a JSON object with a 'test_cases' field")
        raw_cases = parsed.get("test_cases")
        if not isinstance(raw_cases, list):
            raise ValueError("LLM output 'test_cases' field must be a JSON array")
        validated: List[TestCase] = [
            TestCase.model_validate(self._clean_test_case_data(item))
            for item in raw_cases
        ]
        return validated

    async def _generate_layer(
        self,
        provider: LLMProvider,
        user_instructions: str,
        layer: str,
        existing_cases: List[TestCase],
        coverage_level: str = "medium",
        model_profile: Optional[str] = None,
        scenario_embedding_cache: Optional[Dict[str, List[float]]] = None,
        openai_api_key: Optional[str] = None,
    ) -> List[TestCase]:
        """
        Two-pass generation for one layer: extract scenarios, deduplicate scenarios (semantic),
        then expand to test cases. No fixed count; scenarios drive the number of tests.
        """
        scenarios = await self._extract_scenarios(
            provider=provider,
            user_instructions=user_instructions,
            layer=layer,
            coverage_level=coverage_level,
            model_profile=model_profile,
        )
        logger.debug("Layer %s: extracted %d scenarios", layer, len(scenarios))
        scenarios = await deduplicate_scenarios(
            scenarios,
            api_key=openai_api_key,
            threshold=SCENARIO_DEDUP_THRESHOLD,
            cache=scenario_embedding_cache or {},
        )
        logger.debug("Layer %s: %d scenarios after dedup", layer, len(scenarios))
        cases = await self._expand_scenarios_to_tests(
            provider=provider,
            user_instructions=user_instructions,
            layer=layer,
            scenarios=scenarios,
            existing_cases=existing_cases,
            coverage_level=coverage_level,
            model_profile=model_profile,
        )
        return cases

    @staticmethod
    def _sanitize_unicode(s: str) -> str:
        """Remove invalid surrogate characters (U+D800–U+DFFF) that cause Pydantic string_unicode errors."""
        if not isinstance(s, str):
            return str(s)
        return re.sub(r"[\ud800-\udfff]", "", s)

    @staticmethod
    def _clean_test_case_data(test_case_data: dict) -> dict:
        """
        Ensure required fields are present and not empty.
        Sanitize invalid Unicode surrogates from LLM output.

        Some LLMs omit or return empty values for certain fields despite
        instructions. This method provides sensible defaults to prevent
        Pydantic validation errors.
        """
        def _san(s: str) -> str:
            return TestCaseService._sanitize_unicode(s) if isinstance(s, str) else str(s)

        for key in ("test_scenario", "test_description", "pre_condition", "test_data", "expected_result"):
            if test_case_data.get(key) is not None:
                test_case_data[key] = _san(str(test_case_data[key]))
        steps = test_case_data.get("test_steps")
        if isinstance(steps, list):
            test_case_data["test_steps"] = [_san(str(s)) for s in steps]

        if not (test_case_data.get("test_scenario") or "").strip():
            test_case_data["test_scenario"] = "Test scenario as described"
        if not (test_case_data.get("test_description") or "").strip():
            test_case_data["test_description"] = "Verify behavior per requirements"
        if not (test_case_data.get("pre_condition") or "").strip():
            test_case_data["pre_condition"] = "No specific preconditions required"
        if not (test_case_data.get("test_data") or "").strip():
            test_case_data["test_data"] = "Standard test data as per feature requirements"
        if not (test_case_data.get("expected_result") or "").strip():
            test_case_data["expected_result"] = (
                "Behavior matches the test scenario and acceptance criteria."
            )
        if not test_case_data.get("test_steps") or len(test_case_data.get("test_steps", [])) == 0:
            test_case_data["test_steps"] = ["1. Execute the test scenario as described"]
        return test_case_data

    async def generate_test_cases(
        self, payload: TestCaseGenerationRequest
    ) -> List[TestCase]:
        logger.info(
            "Generating test cases",
            extra={
                "project": payload.project,
                "component": payload.component,
                "requirements_count": len(payload.requirements),
                "max_cases": payload.max_cases,
            },
        )

        generated: List[TestCase] = []

        for idx, requirement in enumerate(payload.requirements, start=1):
            if len(generated) >= payload.max_cases:
                break

            scenario = f"[{payload.component}] Requirement {idx}"
            description = requirement.strip()

            test_steps = [
                f"Review requirement: {requirement}",
                "Identify primary user flow and edge cases.",
                "Execute user flow in a controlled environment.",
                "Record observed behavior and compare with acceptance criteria.",
            ]

            expected_result = (
                "System behavior matches the requirement and acceptance criteria "
                "without regressions in related components."
            )

            test_case = TestCase(
                test_scenario=scenario,
                test_description=description,
                pre_condition="System is in a stable state and all prerequisites are met.",
                test_data="As required to exercise the described requirement.",
                test_steps=test_steps,
                expected_result=expected_result,
                created_by=payload.created_by,
            )

            self._store[test_case.id] = test_case
            generated.append(test_case)

        return generated

    @staticmethod
    def _case_to_embedding_text(tc: TestCase) -> str:
        """Build a single string for embedding-based similarity (scenario + description + steps)."""
        steps = " ".join(getattr(tc, "test_steps", []) or [])
        return f"{tc.test_scenario} {tc.test_description} {steps}".strip()

    async def _deduplicate_by_embeddings(
        self,
        cases: List[TestCase],
        *,
        api_key: Optional[str] = None,
        threshold: float = EMBEDDING_DEDUP_THRESHOLD,
    ) -> List[TestCase]:
        """
        Remove near-duplicate test cases using embedding cosine similarity.
        If embeddings unavailable, returns cases unchanged (caller can use title dedup).
        """
        if len(cases) <= 1:
            return cases
        texts = [self._case_to_embedding_text(tc) for tc in cases]
        keep_indices = await deduplicate_indices_by_embeddings(
            texts,
            threshold=threshold,
            api_key=api_key,
        )
        if len(keep_indices) == len(cases):
            return cases
        result = [cases[i] for i in keep_indices]
        logger.info(
            "Embedding dedup: %d -> %d cases removed",
            len(cases),
            len(cases) - len(result),
        )
        return result

    async def generate_ai_test_cases(
        self,
        payload: GenerateTestCasesRequest,
    ) -> List[TestCase]:
        """
        Scenario-driven coverage pipeline: for each layer, extract scenarios (PASS 1)
        then expand to test cases (PASS 2). Append results, then embedding-based
        deduplication, then title-based fallback. Higher coverage_level always
        includes all lower-level dimensions.
        """
        provider = get_provider(payload.provider)
        layers = COVERAGE_LEVEL_LAYERS.get(
            payload.coverage_level,
            COVERAGE_LEVEL_LAYERS["medium"],
        )

        logger.info(
            "AI test case generation requested (scenario-driven)",
            extra={
                "feature_name": payload.feature_name,
                "coverage_level": payload.coverage_level,
                "layers": list(layers),
                "provider": getattr(provider, "__class__", {}).__name__,
            },
        )

        user_instructions = (
            f"Feature name: {payload.feature_name}\n"
            f"Feature description: {payload.feature_description}\n"
        )
        if getattr(payload, "allowed_actions", None) and str(payload.allowed_actions).strip():
            user_instructions += "\n\nAllowed actions: " + str(payload.allowed_actions).strip()
        if getattr(payload, "excluded_features", None) and str(payload.excluded_features).strip():
            user_instructions += "\n\nExcluded features: " + str(payload.excluded_features).strip()

        settings = get_settings()
        scenario_embedding_cache: Dict[str, List[float]] = {}
        accumulated: List[TestCase] = []
        for layer in layers:
            batch = await self._generate_layer(
                provider=provider,
                user_instructions=user_instructions,
                layer=layer,
                existing_cases=accumulated,
                coverage_level=payload.coverage_level,
                model_profile=getattr(payload, "model_profile", None),
                scenario_embedding_cache=scenario_embedding_cache,
                openai_api_key=settings.openai_api_key,
            )
            accumulated.extend(batch)
            logger.debug(
                "Layer %s produced %d cases; total so far: %d",
                layer,
                len(batch),
                len(accumulated),
            )

        accumulated = await self._deduplicate_by_embeddings(
            accumulated,
            api_key=settings.openai_api_key,
            threshold=EMBEDDING_DEDUP_THRESHOLD,
        )
        accumulated = self._remove_near_duplicate_titles(accumulated)
        return accumulated

    async def get_by_id(self, test_case_id: UUID) -> TestCase | None:
        return self._store.get(test_case_id)

    async def delete_test_case(self, test_case_id: UUID) -> bool:
        """
        Remove a test case from the store and from all batch feature results.
        After deletion, the test case is excluded from exports (per-feature and Export All).
        """
        if test_case_id not in self._store:
            return False
        del self._store[test_case_id]
        for batch in self._batch_store.values():
            for fr in batch.features.values():
                if fr.items:
                    fr.items = [tc for tc in fr.items if tc.id != test_case_id]
        return True

    async def list_all(self) -> List[TestCase]:
        return list(self._store.values())

    async def to_response(self, test_case: TestCase) -> TestCaseResponse:
        return TestCaseResponse(
            id=test_case.id,
            test_scenario=test_case.test_scenario,
            test_description=test_case.test_description,
            pre_condition=test_case.pre_condition,
            test_data=test_case.test_data,
            test_steps=test_case.test_steps,
            expected_result=test_case.expected_result,
            created_at=test_case.created_at,
            created_by=test_case.created_by,
        )

    # --- Batch generation ---

    def _feature_config_to_request(
        self,
        config: FeatureConfig,
        provider: Optional[str],
        model_profile: Optional[str] = None,
    ) -> GenerateTestCasesRequest:
        return GenerateTestCasesRequest(
            feature_name=config.feature_name,
            feature_description=config.feature_description,
            allowed_actions=config.allowed_actions,
            excluded_features=config.excluded_features,
            coverage_level=config.coverage_level,
            provider=provider,
            model_profile=model_profile,
        )

    async def _run_one_feature(
        self,
        batch_id: str,
        feature_id: str,
        config: FeatureConfig,
        provider: Optional[str],
    ) -> None:
        batch = self._batch_store.get(batch_id)
        if not batch or feature_id not in batch.features:
            return
        fr = batch.features[feature_id]
        fr.status = "generating"
        try:
            model_profile = getattr(batch, "model_profile", None) if batch else None
            req = self._feature_config_to_request(config, provider, model_profile)
            cases = await self.generate_ai_test_cases(req)
            for tc in cases:
                self._store[tc.id] = tc
            fr.items = cases
            fr.status = "completed"
            fr.error = None
        except Exception as exc:
            logger.exception("Batch feature %s failed: %s", feature_id, exc)
            fr.status = "failed"
            fr.error = str(exc)
            fr.items = []
        self._update_batch_status(batch_id)

    def _update_batch_status(self, batch_id: str) -> None:
        batch = self._batch_store.get(batch_id)
        if not batch:
            return
        statuses = [f.status for f in batch.features.values()]
        if all(s == "completed" for s in statuses):
            batch.status = "completed"
        elif any(s == "failed" for s in statuses):
            batch.status = "partial"
        elif any(s in ("generating", "pending") for s in statuses):
            batch.status = "running"
        else:
            batch.status = "completed"

    async def start_batch(
        self,
        provider: Optional[str],
        features: List[FeatureConfig],
        model_profile: Optional[str] = None,
    ) -> str:
        batch_id = str(uuid4())
        feature_states: Dict[str, _FeatureResultState] = {}
        config_by_feature_id: Dict[str, FeatureConfig] = {}
        for config in features:
            fid = str(uuid4())
            feature_states[fid] = _FeatureResultState(
                feature_id=fid,
                feature_name=config.feature_name,
                status="pending",
            )
            config_by_feature_id[fid] = config
        batch = _BatchState(
            batch_id=batch_id,
            status="running",
            features=feature_states,
            provider=provider,
            model_profile=model_profile,
            config_by_feature_id=config_by_feature_id,
        )
        self._batch_store[batch_id] = batch

        async def run_all() -> None:
            tasks = [
                self._run_one_feature(batch_id, fid, config, provider)
                for fid, config in batch.config_by_feature_id.items()
            ]
            await asyncio.gather(*tasks)
            self._update_batch_status(batch_id)

        asyncio.create_task(run_all())
        return batch_id

    async def get_batch_status(self, batch_id: str) -> Optional[BatchStatusResponse]:
        batch = self._batch_store.get(batch_id)
        if not batch:
            return None
        feature_results: List[BatchFeatureResult] = []
        for fr in batch.features.values():
            items_resp = None
            if fr.items:
                items_resp = [await self.to_response(tc) for tc in fr.items]
            feature_results.append(
                BatchFeatureResult(
                    feature_id=fr.feature_id,
                    feature_name=fr.feature_name,
                    status=fr.status,
                    items=items_resp,
                    error=fr.error,
                )
            )
        return BatchStatusResponse(
            batch_id=batch.batch_id,
            status=batch.status,
            features=feature_results,
        )

    async def retry_batch_feature(
        self,
        batch_id: str,
        feature_id: str,
        provider: Optional[str],
    ) -> bool:
        batch = self._batch_store.get(batch_id)
        if not batch or feature_id not in batch.features:
            return False
        config = batch.config_by_feature_id.get(feature_id)
        if not config:
            return False
        fr = batch.features[feature_id]
        fr.status = "pending"
        fr.error = None
        fr.items = []
        prov = provider if provider is not None else batch.provider
        await self._run_one_feature(batch_id, feature_id, config, prov)
        return True

    async def get_batch_merged_cases(
        self, batch_id: str, dedupe: bool = True
    ) -> List[TestCase]:
        """Return all test cases from a batch merged and optionally deduped by title."""
        batch = self._batch_store.get(batch_id)
        if not batch:
            return []
        all_cases: List[TestCase] = []
        for fr in batch.features.values():
            if fr.items:
                all_cases.extend(fr.items)
        if dedupe and all_cases:
            all_cases = self._remove_near_duplicate_titles(all_cases)
        return all_cases
