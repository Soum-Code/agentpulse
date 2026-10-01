"""Add tool_claims_found to evaluations

Separates "every tool claim checked out" from "there was nothing to check".
Both currently store tool_claim_score = 0.0, and on real traces the second is
almost always the case: the external corpus in Section 11 holds 8,353 prose
spans and zero extractable claims, because agents state intentions rather than
narrating result counts.

Nullable with no backfill on purpose. Rows written before this migration ran
genuinely do not know how many claims were found, and inventing a 0 for them
would assert the very thing this column exists to distinguish. NULL reads as
"unknown for this row", which is true.

Revision ID: a7f2c3d9e104
Revises: 30ca7751ff88
Create Date: 2026-09-21
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7f2c3d9e104"
down_revision: Union[str, Sequence[str], None] = "30ca7751ff88"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("evaluations") as batch_op:
        batch_op.add_column(sa.Column("tool_claims_found", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("evaluations") as batch_op:
        batch_op.drop_column("tool_claims_found")
