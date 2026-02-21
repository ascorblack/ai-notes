from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    folder_id: Mapped[int | None] = mapped_column(
        ForeignKey("folders.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)
    is_task: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    subtasks: Mapped[list[dict] | None] = mapped_column(JSONB, default=None, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(default=None, nullable=True)
    priority: Mapped[str | None] = mapped_column(String(16), default="medium", nullable=True)
    task_status: Mapped[str | None] = mapped_column(String(20), default="backlog", nullable=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="notes")
    folder = relationship("Folder", back_populates="notes")
    event = relationship(
        "Event", back_populates="note", uselist=False, passive_deletes=True
    )
    note_tags = relationship("NoteTag", back_populates="note", cascade="all, delete-orphan")
    tags = relationship("Tag", secondary="note_tags", back_populates="notes", viewonly=True)
    outgoing_links = relationship("NoteLink", foreign_keys="NoteLink.source_note_id", back_populates="source_note", cascade="all, delete-orphan")
    incoming_links = relationship("NoteLink", foreign_keys="NoteLink.target_note_id", back_populates="target_note", cascade="all, delete-orphan")
    versions = relationship("NoteVersion", back_populates="note", cascade="all, delete-orphan")
