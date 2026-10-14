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

# ---- What this file is for ---------------------------------------------------
# This migration adds one column, `tool_claims_found`, to the existing `evaluations`
# table. A tool claim is something an agent says about a tool it used (for example "I used
# the search tool and found 3 documents"), which is then compared with the tool calls that
# were really recorded. The new column stores how many such claims were found in a span's
# output. With it, a tool_claim_score of 0.0 can be told apart: "everything matched" (the
# count is above 0) or "there was nothing to check" (the count is 0). How to read the
# values: empty (NULL) = the check did not run, or the row is older than this migration;
# 0 = it ran and found no claim; above 0 = that many claims.
#
# How it fits in: it is the sixth migration in the chain. The worker saves the
# value in services/evaluation_runner.py (from the tool-claim result in
# services/tool_claim.py). The column is also declared in the Evaluation class in
# app/models.py.
# ------------------------------------------------------------------------------

from typing import Sequence, Union

# sa = SQLAlchemy. Here it names the column type (Integer = a whole number).
import sqlalchemy as sa

# op = Alembic's helper for schema changes (add_column, drop_column, ...).
from alembic import op

# Every migration has its own id (revision) and the id of the migration before it
# (down_revision). Here down_revision is 30ca7751ff88 (the api_keys migration), so this
# one runs right after it. branch_labels and depends_on are not used (None).
# revision identifiers, used by Alembic.
revision: str = "a7f2c3d9e104"
down_revision: Union[str, Sequence[str], None] = "30ca7751ff88"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Adds the column. batch_alter_table is Alembic's "batch" mode (see item 3 in the env.py
# docstring): on SQLite it can rebuild a table for changes SQLite cannot make directly.
# nullable=True with no default means old rows stay empty (NULL). They are not filled
# with 0, because 0 would wrongly say "checked, found nothing" (see the docstring above).
def upgrade() -> None:
    with op.batch_alter_table("evaluations") as batch_op:
        batch_op.add_column(sa.Column("tool_claims_found", sa.Integer(), nullable=True))


# Undoes upgrade(): removes the column. The counts stored in it are lost.
def downgrade() -> None:
    with op.batch_alter_table("evaluations") as batch_op:
        batch_op.drop_column("tool_claims_found")
