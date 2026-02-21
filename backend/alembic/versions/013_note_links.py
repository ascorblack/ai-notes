"""Add note_links table for wikilinks/backlinks

Revision ID: 013
Revises: 012
Create Date: 2026-02-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "note_links",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source_note_id", sa.Integer(), nullable=False),
        sa.Column("target_note_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["source_note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_note_id", "target_note_id", name="uq_note_link"),
    )
    op.create_index(op.f("ix_note_links_source"), "note_links", ["source_note_id"], unique=False)
    op.create_index(op.f("ix_note_links_target"), "note_links", ["target_note_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_note_links_target"), table_name="note_links")
    op.drop_index(op.f("ix_note_links_source"), table_name="note_links")
    op.drop_table("note_links")
