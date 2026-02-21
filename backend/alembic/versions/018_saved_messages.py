"""Add saved_messages and saved_message_categories tables

Revision ID: 018
Revises: 017
Create Date: 2026-02-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saved_message_categories",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_saved_category_user_name"),
    )
    op.create_index(op.f("ix_saved_message_categories_user_id"), "saved_message_categories", ["user_id"], unique=False)

    op.create_table(
        "saved_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["saved_message_categories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "created_at", name="uq_saved_message_time"),
    )
    op.create_index(op.f("ix_saved_messages_user_id"), "saved_messages", ["user_id"], unique=False)
    op.create_index(op.f("ix_saved_messages_created_at"), "saved_messages", ["created_at"], unique=False)
    op.create_index(op.f("ix_saved_messages_deleted_at"), "saved_messages", ["deleted_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_saved_messages_deleted_at"), table_name="saved_messages")
    op.drop_index(op.f("ix_saved_messages_created_at"), table_name="saved_messages")
    op.drop_index(op.f("ix_saved_messages_user_id"), table_name="saved_messages")
    op.drop_table("saved_messages")
    op.drop_index(op.f("ix_saved_message_categories_user_id"), table_name="saved_message_categories")
    op.drop_table("saved_message_categories")
