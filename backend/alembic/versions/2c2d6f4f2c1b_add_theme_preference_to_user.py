"""add theme preference to user

Revision ID: 2c2d6f4f2c1b
Revises: eb86591258e8
Create Date: 2026-05-05 23:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2c2d6f4f2c1b"
down_revision: Union[str, None] = "eb86591258e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("theme_preference", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "theme_preference")
