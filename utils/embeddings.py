"""
Embedding-based deduplication for test cases and scenarios.

- Test cases: uses text-embedding-3-small, deduplicate_indices_by_embeddings.
- Scenarios: uses text-embedding-3-large, normalize_scenario_text, deduplicate_scenarios with cache.
Cosine similarity threshold 0.90; programmatic dedup only.
"""
from __future__ import annotations

import re
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# Similarity above this → treat as duplicate.
DEFAULT_DEDUP_THRESHOLD: float = 0.90

# Test-case dedup (existing flow).
OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

# Scenario dedup: higher-quality model.
OPENAI_EMBEDDING_MODEL_SCENARIOS: str = "text-embedding-3-large"

# Filler phrases to strip when normalizing scenario text (case-insensitive).
SCENARIO_FILLER_PHRASES: tuple[str, ...] = (
    "validate that",
    "ensure that",
    "verify that",
    "check that",
    "confirm that",
    "make sure that",
    "ensure ",
    "validate ",
    "verify ",
    "check ",
)


def normalize_scenario_text(scenario: str) -> str:
    """
    Normalize scenario text before embedding: lowercase, remove filler phrases, trim, collapse whitespace.
    Reusable for semantic comparison and cache keys.
    """
    if not scenario or not isinstance(scenario, str):
        return ""
    s = scenario.strip().lower()
    for phrase in SCENARIO_FILLER_PHRASES:
        s = re.sub(re.escape(phrase), " ", s, flags=re.IGNORECASE)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two vectors. Assumes same length and non-zero norm."""
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def get_embeddings(texts: List[str], api_key: Optional[str] = None) -> Optional[List[List[float]]]:
    """
    Get embeddings for a list of texts using OPENAI_EMBEDDING_MODEL (test-case dedup).
    Returns None if api_key is missing or request fails.
    """
    if not api_key or not texts:
        return None
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)
        response = await client.embeddings.create(
            model=OPENAI_EMBEDDING_MODEL,
            input=texts,
        )
        by_index = {item.index: item.embedding for item in response.data}
        return [by_index[i] for i in range(len(texts))]
    except Exception as exc:
        logger.warning("Embeddings request failed: %s", exc)
        return None


async def get_embeddings_cached(
    texts: List[str],
    api_key: str,
    *,
    cache: Dict[str, List[float]],
    model: str = OPENAI_EMBEDDING_MODEL_SCENARIOS,
) -> Optional[List[List[float]]]:
    """
    Get embeddings for texts, using cache to avoid recomputation. Same text (exact key) is only embedded once.
    Returns embeddings in same order as texts. Mutates cache.
    """
    if not api_key or not texts:
        return None
    result: List[Optional[List[float]]] = [None] * len(texts)
    to_fetch: List[tuple[int, str]] = []
    for i, t in enumerate(texts):
        if t in cache:
            result[i] = cache[t]
        else:
            to_fetch.append((i, t))
    if to_fetch:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key)
            fetch_texts = [t for _, t in to_fetch]
            response = await client.embeddings.create(model=model, input=fetch_texts)
            by_index = {item.index: item.embedding for item in response.data}
            for k in range(len(fetch_texts)):
                t = fetch_texts[k]
                emb = by_index[k]
                cache[t] = emb
                idx = to_fetch[k][0]
                result[idx] = emb
        except Exception as exc:
            logger.warning("Embeddings request failed: %s", exc)
            return None
    if any(r is None for r in result):
        return None
    return [result[i] for i in range(len(texts))]


async def deduplicate_scenarios(
    scenarios: List[str],
    *,
    api_key: Optional[str] = None,
    threshold: float = DEFAULT_DEDUP_THRESHOLD,
    cache: Optional[Dict[str, List[float]]] = None,
) -> List[str]:
    """
    Semantically deduplicate scenarios using embeddings. Normalizes text, then cosine similarity.
    If similarity > threshold: treat as duplicate; keep the clearer/shorter scenario.
    Uses cache to avoid embedding the same normalized scenario twice (e.g. across layers).
    Reusable utility; does not rely on prompt instructions.
    """
    if not scenarios:
        return []
    if len(scenarios) == 1:
        return list(scenarios)
    if not api_key:
        return list(scenarios)
    normalized = [normalize_scenario_text(s) for s in scenarios]
    seen: Dict[str, int] = {}
    unique_norm: List[str] = []
    unique_orig: List[str] = []
    for orig, norm in zip(scenarios, normalized):
        if not norm:
            unique_norm.append(norm)
            unique_orig.append(orig)
            continue
        if norm in seen:
            continue
        seen[norm] = len(unique_orig)
        unique_norm.append(norm)
        unique_orig.append(orig)
    if len(unique_orig) <= 1:
        return unique_orig
    emb_cache: Dict[str, List[float]] = cache if cache is not None else {}
    embeddings = await get_embeddings_cached(unique_norm, api_key, cache=emb_cache)
    if not embeddings or len(embeddings) != len(unique_orig):
        return unique_orig
    keep_indices: List[int] = [0]
    for j in range(1, len(unique_orig)):
        is_dup = False
        for i in keep_indices:
            if cosine_similarity(embeddings[i], embeddings[j]) >= threshold:
                is_dup = True
                if len(unique_orig[j]) < len(unique_orig[i]):
                    keep_indices = [x for x in keep_indices if x != i]
                    keep_indices.append(j)
                break
        if not is_dup:
            keep_indices.append(j)
    kept = sorted(keep_indices)
    result = [unique_orig[i] for i in kept]
    if len(result) < len(scenarios):
        logger.info(
            "Scenario dedup: %d -> %d (removed %d)",
            len(scenarios),
            len(result),
            len(scenarios) - len(result),
        )
    return result


async def deduplicate_indices_by_embeddings(
    texts: List[str],
    *,
    threshold: float = DEFAULT_DEDUP_THRESHOLD,
    api_key: Optional[str] = None,
) -> List[int]:
    """
    Return indices of items to KEEP after embedding-based deduplication (test cases).
    For each pair (i, j) with i < j, if similarity(i, j) >= threshold, j is considered duplicate and removed.
    If embeddings are unavailable, returns list(range(len(texts))) (keep all).
    """
    if len(texts) <= 1:
        return list(range(len(texts)))
    embeddings = await get_embeddings(texts, api_key=api_key)
    if not embeddings or len(embeddings) != len(texts):
        return list(range(len(texts)))
    keep: List[int] = []
    for j in range(len(texts)):
        is_dup = False
        for i in keep:
            if cosine_similarity(embeddings[i], embeddings[j]) >= threshold:
                is_dup = True
                break
        if not is_dup:
            keep.append(j)
    return keep
