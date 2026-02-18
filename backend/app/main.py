import asyncio
import logging
import sys
from contextlib import asynccontextmanager

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from sqlalchemy import select

from app.config import settings
from app.database import async_session_maker
from app.models import Note
from app.routers import agent, auth, chat, events, folders, notes, search as search_router, transcribe
from app.services import embeddings, search as search_service, stt, workspace, workspace_migrate

# Force console logging — errors go to stderr
logging.basicConfig(
    level=logging.ERROR,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    stream=sys.stderr,
    force=True,
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: migrations, then load Whisper model
    def _run_migrations() -> None:
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _run_migrations)
    logger.info("Migrations applied")

    await workspace_migrate.migrate_db_content_to_workspace()

    await loop.run_in_executor(None, embeddings.load_model)

    async def _reindex_all() -> None:
        async with async_session_maker() as db:
            result = await db.execute(
                select(Note).where(Note.deleted_at.is_(None))
            )
            notes = list(result.scalars().all())
        if not notes:
            return
        payload = [
            (n.user_id, n.id, n.title, workspace.get_content(n.user_id, n.id))
            for n in notes
        ]
        count = await loop.run_in_executor(None, search_service.reindex_notes_sync, payload)
        logger.info("Search reindex: %s notes", count)

    await _reindex_all()

    await loop.run_in_executor(None, stt.load_model)
    unload_task = stt.start_idle_unload_task()

    yield

    # Shutdown: cancel idle-unload task
    unload_task.cancel()
    try:
        await unload_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="AI Notes API", lifespan=lifespan)


@app.exception_handler(Exception)
async def log_unhandled_exceptions(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception", extra={"path": request.url.path, "method": request.method})
    return JSONResponse(status_code=500, content={"detail": str(exc)})


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(notes.router)
app.include_router(search_router.router)
app.include_router(folders.router)
app.include_router(events.router)
app.include_router(agent.router)
app.include_router(chat.router)
app.include_router(transcribe.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
