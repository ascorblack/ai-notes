"""Add agent_settings table

Revision ID: 005
Revises: 004
Create Date: 2025-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_settings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("agent_type", sa.String(32), nullable=False),
        sa.Column("temperature", sa.Float(), nullable=False, server_default="0.7"),
        sa.Column("frequency_penalty", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("top_p", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("max_tokens", sa.Integer(), nullable=False, server_default="16384"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "agent_type", name="uq_agent_settings_user_type"),
    )
    op.create_index("ix_agent_settings_user_id", "agent_settings", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_agent_settings_user_id", table_name="agent_settings")
    op.drop_table("agent_settings")
