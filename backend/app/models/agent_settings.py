from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AgentSettings(Base):
    __tablename__ = "agent_settings"
    __table_args__ = (UniqueConstraint("user_id", "agent_type", name="uq_agent_settings_user_type"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    agent_type: Mapped[str] = mapped_column(String(32), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    model: Mapped[str | None] = mapped_column(String(256), nullable=True)
    api_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    temperature: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    frequency_penalty: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    top_p: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    max_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=16384)
    enabled_tools: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True, default=None)

    user = relationship("User", back_populates="agent_settings")
