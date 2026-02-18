"""Embedding model for semantic search. Loads once at startup."""

import logging
import os
from typing import TYPE_CHECKING

from app.config import settings

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

_model: "SentenceTransformer | None" = None

EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
EMBEDDING_DIMS = 384


def load_model() -> None:
    """Load the embedding model (call at startup)."""
    global _model
    if _model is not None:
        return
    cache_dir = settings.embedding_cache_dir
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        os.environ["HUGGINGFACE_HUB_CACHE"] = cache_dir
        logger.info("Loading embedding model: %s (cache: %s)", EMBEDDING_MODEL, cache_dir)
    else:
        logger.info("Loading embedding model: %s (device=cpu)", EMBEDDING_MODEL)
    from sentence_transformers import SentenceTransformer

    _model = SentenceTransformer(EMBEDDING_MODEL, device="cpu")
    logger.info("Embedding model loaded")


def get_model() -> "SentenceTransformer":
    if _model is None:
        load_model()
    assert _model is not None
    return _model


def embed(text: str) -> list[float]:
    """Compute embedding for a single text. Returns 384-dim vector."""
    if not text or not text.strip():
        return [0.0] * EMBEDDING_DIMS
    model = get_model()
    vec = model.encode(text, device="cpu", convert_to_numpy=True)
    return vec.tolist()
