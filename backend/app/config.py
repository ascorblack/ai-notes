from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str

    secret_key: str
    access_token_expire_minutes: int = 10080
    allow_registration: bool = True

    vllm_base_url: str = "http://host.docker.internal:8000/v1"
    vllm_model: str = "Qwen3-30B-A3B-Thinking-2507"
    vllm_api_key: str = ""

    # Chat agent (separate model for discussions)
    vllm_chat_base_url: str = "http://host.docker.internal:8000/v1"
    vllm_chat_model: str = "Qwen3-30B-A3B-Thinking-2507"
    vllm_chat_api_key: str = ""

    # Agent LLM defaults (per-user overrides in DB)
    vllm_temperature: float = 0.7
    vllm_frequency_penalty: float = 0.0
    vllm_top_p: float = 1.0
    vllm_max_tokens: int = 16384

    whisper_model: str = "distil-large-v3"
    whisper_language: str = "ru"
    whisper_cache_dir: str | None = None

    embedding_cache_dir: str | None = None

    workspace_dir: str = "workspace"
    redis_url: str = "redis://redis:6379"
    search_vector_score_threshold: float = 0.65  # COSINE distance: 0=identical, 2=opposite; skip if > threshold

    cors_origins: str = "http://localhost,http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
