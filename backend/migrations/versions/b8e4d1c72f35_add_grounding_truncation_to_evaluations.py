"""Add grounding truncation columns to evaluations

compute_nli_grounding already measures whether the premise exceeded DeBERTa's
512-token window, and evaluation_runner surfaced it only as a logger.warning
fired once per worker process. After the first occurrence there was no record
at all that a score had been computed on partial evidence.

Same shape as tool_claims_found in a7f2c3d9e104: a value the evaluator knows,
dropped before it reaches the row, leaving a number that cannot be audited.

Nullable with no backfill. Rows written before this migration do not know
whether their premise was truncated, and writing False would assert it was not.

Revision ID: b8e4d1c72f35
Revises: a7f2c3d9e104
Create Date: 2026-09-21
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8e4d1c72f35"
down_revision: Union[str, Sequence[str], None] = "a7f2c3d9e104"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("evaluations") as batch_op:
        batch_op.add_column(
            sa.Column("grounding_input_truncated", sa.Boolean(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("grounding_input_tokens", sa.Integer(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("evaluations") as batch_op:
        batch_op.drop_column("grounding_input_tokens")
        batch_op.drop_column("grounding_input_truncated")
