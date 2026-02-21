import logging
import os
import tempfile
from typing import Literal

from faster_whisper import WhisperModel

from app.config import settings

logger = logging.getLogger(__name__)

COMPUTE_TYPE: Literal["int8", "float16", "float32"] = "int8"

_model: WhisperModel | None = None


def load_model() -> None:
    global _model
    try:
        logger.info("Loading STT model: %s (%s)", settings.whisper_model, COMPUTE_TYPE)
        kw: dict = {"device": "cpu", "compute_type": COMPUTE_TYPE}
        if settings.whisper_cache_dir:
            kw["download_root"] = settings.whisper_cache_dir
        _model = WhisperModel(settings.whisper_model, **kw)
        logger.info("STT model loaded")
    except Exception as e:
        logger.error("Failed to load STT model", exc_info=True)
        _model = None


def unload_model() -> None:
    global _model
    if _model:
        del _model
        _model = None
        logger.info("STT model unloaded")


async def transcribe(audio_bytes: bytes, language: str | None = None) -> str:
    if _model is None:
        load_model()
        if _model is None:
            return ""

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
        f.write(audio_bytes)
        audio_path = f.name

    try:
        lang = language or settings.whisper_language or None
        segments, _ = _model.transcribe(
            audio_path,
            language=lang,
            word_timestamps=False,
        )
        parts = [s.text for s in segments if s.text]
        return " ".join(parts) if parts else ""
    finally:
        try:
            os.unlink(audio_path)
        except OSError:
            pass


def start_idle_unload_task():
    import asyncio

    async def task():
        while True:
            await asyncio.sleep(300)  # 5 minutes
            if _model is not None:
                logger.info("Idle timeout: unloading STT model")
                unload_model()

    return asyncio.create_task(task())
