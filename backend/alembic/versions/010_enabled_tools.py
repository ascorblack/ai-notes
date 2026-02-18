"""Add enabled_tools field to agent_settings

Revision ID: 010
Revises: 009
Create Date: 2026-02-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agent_settings", sa.Column("enabled_tools", postgresql.JSONB(), nullable=True, default=None))


def downgrade() -> None:
    op.drop_column("agent_settings", "enabled_tools")
