import asyncio
import logging
import os
import tempfile
import time
from pathlib import Path

from faster_whisper import WhisperModel

from app.config import settings

logger = logging.getLogger(__name__)

IDLE_UNLOAD_SECONDS = 120

_model: WhisperModel | None = None
_last_used: float = 0
_unload_task: asyncio.Task | None = None


def load_model() -> None:
    """Load model at startup."""
    global _model, _last_used
    if _model is not None:
        return
    cache_dir = settings.whisper_cache_dir
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        os.environ["HUGGINGFACE_HUB_CACHE"] = cache_dir
        logger.info("Loading Whisper model: %s (cache: %s)", settings.whisper_model, cache_dir)
    else:
        logger.info("Loading Whisper model: %s", settings.whisper_model)
    kwargs: dict = {"device": "cpu", "compute_type": "int8"}
    if cache_dir:
        kwargs["download_root"] = cache_dir
    _model = WhisperModel(settings.whisper_model, **kwargs)
    _last_used = time.monotonic()


def unload_model() -> None:
    """Release model to free memory after idle."""
    global _model
    if _model is None:
        return
    logger.info("Unloading Whisper model (idle > %s s)", IDLE_UNLOAD_SECONDS)
    _model = None


def get_model() -> WhisperModel:
    global _model, _last_used
    if _model is None:
        load_model()
    _last_used = time.monotonic()
    return _model


def _transcribe_sync(path: str) -> str:
    model = get_model()
    segments, _ = model.transcribe(
        path,
        language=settings.whisper_language,
        task="transcribe",
        vad_filter=True,
        condition_on_previous_text=False,
    )
    return " ".join(s.text for s in segments if s.text).strip()


async def _unload_idle_loop() -> None:
    """Background task: unload model after IDLE_UNLOAD_SECONDS of no use."""
    while True:
        await asyncio.sleep(60)
        if _model is None:
            continue
        if time.monotonic() - _last_used >= IDLE_UNLOAD_SECONDS:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, _do_unload)


def _do_unload() -> None:
    unload_model()


def start_idle_unload_task() -> asyncio.Task:
    """Start background task that unloads model when idle. Call from app lifespan."""
    global _unload_task
    _unload_task = asyncio.create_task(_unload_idle_loop())
    return _unload_task


async def transcribe(audio_bytes: bytes) -> str:
    suffix = ".webm" if audio_bytes[:4] == b"RIFF" else ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_bytes)
        path = Path(f.name)
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _transcribe_sync, str(path))
    finally:
        path.unlink(missing_ok=True)
