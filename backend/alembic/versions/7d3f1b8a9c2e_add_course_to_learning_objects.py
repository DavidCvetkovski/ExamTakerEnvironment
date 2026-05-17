"""add course to learning objects

Revision ID: 7d3f1b8a9c2e
Revises: 2c2d6f4f2c1b
Create Date: 2026-05-16 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7d3f1b8a9c2e"
down_revision: Union[str, None] = "2c2d6f4f2c1b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("learning_objects", sa.Column("course_id", sa.UUID(), nullable=True))
    op.create_index("ix_learning_objects_course_id", "learning_objects", ["course_id"])
    op.create_foreign_key(
        "fk_learning_objects_course_id_courses",
        "learning_objects",
        "courses",
        ["course_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_learning_objects_course_id_courses", "learning_objects", type_="foreignkey")
    op.drop_index("ix_learning_objects_course_id", table_name="learning_objects")
    op.drop_column("learning_objects", "course_id")
