"""Add model connection settings to agent_settings

Revision ID: 007
Revises: 006
Create Date: 2025-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agent_settings", sa.Column("base_url", sa.String(512), nullable=True))
    op.add_column("agent_settings", sa.Column("model", sa.String(256), nullable=True))
    op.add_column("agent_settings", sa.Column("api_key", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_settings", "api_key")
    op.drop_column("agent_settings", "model")
    op.drop_column("agent_settings", "base_url")
