"""Add task fields to notes: is_task, subtasks, completed_at

Revision ID: 009
Revises: 008
Create Date: 2025-02-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("is_task", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("notes", sa.Column("subtasks", postgresql.JSONB(), nullable=True))
    op.add_column("notes", sa.Column("completed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("notes", "completed_at")
    op.drop_column("notes", "subtasks")
    op.drop_column("notes", "is_task")
