"""epoch 5.5 courses and scheduling

Revision ID: 1c33c55d5f3a
Revises: 7ce6683915f3
Create Date: 2026-03-09 19:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "1c33c55d5f3a"
down_revision: Union[str, None] = "7ce6683915f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


course_session_status = postgresql.ENUM(
    "SCHEDULED",
    "ACTIVE",
    "CLOSED",
    "CANCELED",
    name="coursesessionstatus",
)
exam_session_mode = postgresql.ENUM(
    "ASSIGNED",
    "PRACTICE",
    name="examsessionmode",
)


def upgrade() -> None:
    course_session_status.create(op.get_bind(), checkfirst=True)
    exam_session_mode.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "courses",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(op.f("ix_courses_code"), "courses", ["code"], unique=True)
    op.create_index(op.f("ix_courses_created_by"), "courses", ["created_by"], unique=False)

    op.create_table(
        "course_enrollments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("course_id", sa.UUID(), nullable=False),
        sa.Column("student_id", sa.UUID(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("enrolled_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("course_id", "student_id", name="uq_course_enrollment_course_student"),
    )
    op.create_index(op.f("ix_course_enrollments_course_id"), "course_enrollments", ["course_id"], unique=False)
    op.create_index(op.f("ix_course_enrollments_student_id"), "course_enrollments", ["student_id"], unique=False)

    op.create_table(
        "scheduled_exam_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("course_id", sa.UUID(), nullable=False),
        sa.Column("test_definition_id", sa.UUID(), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "SCHEDULED",
                "ACTIVE",
                "CLOSED",
                "CANCELED",
                name="coursesessionstatus",
                create_type=False,
            ),
            nullable=False,
            server_default="SCHEDULED",
        ),
        sa.Column("duration_minutes_override", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["test_definition_id"], ["test_definitions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scheduled_exam_sessions_course_id"), "scheduled_exam_sessions", ["course_id"], unique=False)
    op.create_index(op.f("ix_scheduled_exam_sessions_created_by"), "scheduled_exam_sessions", ["created_by"], unique=False)
    op.create_index(op.f("ix_scheduled_exam_sessions_starts_at"), "scheduled_exam_sessions", ["starts_at"], unique=False)
    op.create_index(op.f("ix_scheduled_exam_sessions_test_definition_id"), "scheduled_exam_sessions", ["test_definition_id"], unique=False)

    op.add_column(
        "exam_sessions",
        sa.Column("scheduled_session_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "exam_sessions",
        sa.Column(
            "session_mode",
            postgresql.ENUM(
                "ASSIGNED",
                "PRACTICE",
                name="examsessionmode",
                create_type=False,
            ),
            nullable=False,
            server_default="PRACTICE",
        ),
    )
    op.create_index(op.f("ix_exam_sessions_scheduled_session_id"), "exam_sessions", ["scheduled_session_id"], unique=False)
    op.create_foreign_key(
        "fk_exam_sessions_scheduled_session_id",
        "exam_sessions",
        "scheduled_exam_sessions",
        ["scheduled_session_id"],
        ["id"],
    )
    op.execute("UPDATE exam_sessions SET session_mode = 'PRACTICE' WHERE session_mode IS NULL")
    op.alter_column("exam_sessions", "session_mode", server_default=None)


def downgrade() -> None:
    op.drop_constraint("fk_exam_sessions_scheduled_session_id", "exam_sessions", type_="foreignkey")
    op.drop_index(op.f("ix_exam_sessions_scheduled_session_id"), table_name="exam_sessions")
    op.drop_column("exam_sessions", "session_mode")
    op.drop_column("exam_sessions", "scheduled_session_id")

    op.drop_index(op.f("ix_scheduled_exam_sessions_test_definition_id"), table_name="scheduled_exam_sessions")
    op.drop_index(op.f("ix_scheduled_exam_sessions_starts_at"), table_name="scheduled_exam_sessions")
    op.drop_index(op.f("ix_scheduled_exam_sessions_created_by"), table_name="scheduled_exam_sessions")
    op.drop_index(op.f("ix_scheduled_exam_sessions_course_id"), table_name="scheduled_exam_sessions")
    op.drop_table("scheduled_exam_sessions")

    op.drop_index(op.f("ix_course_enrollments_student_id"), table_name="course_enrollments")
    op.drop_index(op.f("ix_course_enrollments_course_id"), table_name="course_enrollments")
    op.drop_table("course_enrollments")

    op.drop_index(op.f("ix_courses_created_by"), table_name="courses")
    op.drop_index(op.f("ix_courses_code"), table_name="courses")
    op.drop_table("courses")

    exam_session_mode.drop(op.get_bind(), checkfirst=True)
    course_session_status.drop(op.get_bind(), checkfirst=True)
