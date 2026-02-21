from datetime import datetime
from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SavedMessage(Base):
    __tablename__ = "saved_messages"
    __table_args__ = (UniqueConstraint("user_id", "created_at", name="uq_saved_message_time"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("saved_message_categories.id", ondelete="SET NULL"), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True, index=True)

    user = relationship("User", back_populates="saved_messages")
    category = relationship("SavedMessageCategory", back_populates="messages")


class SavedMessageCategory(Base):
    __tablename__ = "saved_message_categories"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_saved_category_user_name"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    user = relationship("User", back_populates="saved_message_categories")
    messages = relationship("SavedMessage", back_populates="category", cascade="all, delete-orphan")
