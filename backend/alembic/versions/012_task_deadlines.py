"""Add deadline and priority fields to notes (tasks)

Revision ID: 012
Revises: 011
Create Date: 2026-02-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "notes",
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "notes",
        sa.Column("priority", sa.String(16), nullable=True, server_default="medium")
    )
    op.create_index(op.f("ix_notes_deadline"), "notes", ["deadline"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_notes_deadline"), table_name="notes")
    op.drop_column("notes", "priority")
    op.drop_column("notes", "deadline")
