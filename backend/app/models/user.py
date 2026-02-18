from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    folders = relationship("Folder", back_populates="user")
    notes = relationship("Note", back_populates="user")
    events = relationship("Event", back_populates="user")
    agent_settings = relationship("AgentSettings", back_populates="user")
    chat_sessions = relationship("ChatSession", back_populates="user")
