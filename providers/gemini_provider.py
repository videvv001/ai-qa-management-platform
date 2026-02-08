from __future__ import annotations

import logging
from typing import Optional

from core.config import get_settings
from providers.base import LLMProvider


logger = logging.getLogger(__name__)


class GeminiProvider(LLMProvider):
    """
    LLM provider that calls the Google Gemini API (google-genai SDK).

    Supports gemini-2.5-flash. Model is configurable via settings or model_id in kwargs.
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        api_key = self._settings.gemini_api_key
        if not api_key:
            raise ValueError(
                "Gemini API key is required when using Gemini provider. "
                "Set AI_TC_GEN_GEMINI_API_KEY in .env."
            )
        from google import genai
        self._client = genai.Client(api_key=api_key)

    async def generate_test_cases(self, prompt: str, **kwargs: object) -> str:
        model_id = (
            kwargs.get("model_id")
            if isinstance(kwargs.get("model_id"), str) and kwargs.get("model_id")
            else self._settings.gemini_model
        )
        # Cap output length for JSON responses
        max_output_tokens = 16384

        logger.info(
            "Gemini request: model=%s max_output_tokens=%s",
            model_id,
            max_output_tokens,
        )

        response = await self._client.aio.models.generate_content(
            model=model_id,
            contents=prompt,
            config={
                "temperature": 0.3,
                "max_output_tokens": max_output_tokens,
            },
        )

        if not response or not response.text:
            return ""
        return response.text
