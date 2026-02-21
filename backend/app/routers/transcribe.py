import logging

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Request

from app.dependencies import get_current_user
from app.models import User
from app.middleware.rate_limit import transcribe_limiter
from app.services.stt import transcribe

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transcribe", tags=["transcribe"])


@router.post("")
@transcribe_limiter
async def transcribe_audio(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    if not file.content_type or "audio" not in file.content_type:
        raise HTTPException(status_code=400, detail="Expected audio file")
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        text = await transcribe(audio_bytes)
    except ValueError as e:
        logger.error("Transcribe error", extra={"user_id": user.id, "error": str(e)})
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("Transcribe failed", extra={"user_id": user.id})
        raise HTTPException(status_code=500, detail=str(e))
    return {"text": text}
