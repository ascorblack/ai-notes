"""Deduplicate user_profile_facts by keeping first occurrence per user+normalized fact

Revision ID: 004
Revises: 003
Create Date: 2025-02-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Delete duplicates: keep row with smallest id per (user_id, lower(trim(fact)))
    op.execute(sa.text("""
        DELETE FROM user_profile_facts AS f1
        WHERE EXISTS (
            SELECT 1 FROM user_profile_facts AS f2
            WHERE f1.user_id = f2.user_id
              AND LOWER(TRIM(f1.fact)) = LOWER(TRIM(f2.fact))
              AND f1.id > f2.id
        )
    """))


def downgrade() -> None:
    pass
