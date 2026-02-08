from __future__ import annotations

from core.config import get_settings
from providers.base import LLMProvider
from providers.gemini_provider import GeminiProvider
from providers.groq_provider import GroqProvider
from providers.ollama_provider import OllamaProvider
from providers.openai_provider import OpenAIProvider

# Model ID (frontend value) -> provider name. Used when request sends model_id.
MODEL_ID_TO_PROVIDER: dict[str, str] = {
    "gpt-4o-mini": "openai",
    "gpt-4o": "openai",
    "gemini-2.5-flash": "gemini",
    "llama-3.3-70b-versatile": "groq",
    "llama3.2:3b": "ollama",
}


def model_id_to_provider(model_id: str | None) -> str | None:
    """Return provider name for a given model_id, or None if unknown."""
    if not model_id or not isinstance(model_id, str):
        return None
    return MODEL_ID_TO_PROVIDER.get(model_id.strip())


def get_provider(provider_name: str | None = None) -> LLMProvider:
    """
    Return the LLM provider for the given name.

    Args:
        provider_name: "ollama", "openai", "gemini", "groq", or None to use default from config.

    Returns:
        An LLMProvider implementation.

    Raises:
        ValueError: If provider_name is not supported or config is invalid.
    """
    settings = get_settings()
    name = (provider_name or settings.default_llm_provider).strip().lower()

    if name == "ollama":
        return OllamaProvider()
    if name == "openai":
        return OpenAIProvider()
    if name == "gemini":
        return GeminiProvider()
    if name == "groq":
        return GroqProvider()

    raise ValueError(
        f"Unsupported LLM provider: {provider_name!r}. "
        "Use 'ollama', 'openai', 'gemini', or 'groq'."
    )
