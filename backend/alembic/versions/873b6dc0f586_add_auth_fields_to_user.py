"""add_auth_fields_to_user

Revision ID: 873b6dc0f586
Revises: 5b0c7b1f0f13
Create Date: 2026-03-03 00:42:58.729487

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '873b6dc0f586'
down_revision: Union[str, None] = '5b0c7b1f0f13'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

userrole_enum = sa.Enum('ADMIN', 'CONSTRUCTOR', 'REVIEWER', 'STUDENT', name='userrole')


def upgrade() -> None:
    # 1. Create the enum type first (Postgres requires it to exist before the column)
    userrole_enum.create(op.get_bind(), checkfirst=True)

    # 2. Add vunet_id (nullable is fine)
    op.add_column('users', sa.Column('vunet_id', sa.String(), nullable=True))

    # 3. Add hashed_password with a safe temporary default; drop default after
    op.add_column('users', sa.Column(
        'hashed_password', sa.String(), nullable=False,
        server_default='__placeholder__'
    ))
    op.alter_column('users', 'hashed_password', server_default=None)

    # 4. Add role with a safe temporary default; drop default after
    op.add_column('users', sa.Column(
        'role', userrole_enum, nullable=False,
        server_default='STUDENT'
    ))
    op.alter_column('users', 'role', server_default=None)

    # 5. Add is_active with default True
    op.add_column('users', sa.Column(
        'is_active', sa.Boolean(), nullable=False,
        server_default=sa.true()
    ))
    op.alter_column('users', 'is_active', server_default=None)

    # 6. Index on vunet_id
    op.create_index(op.f('ix_users_vunet_id'), 'users', ['vunet_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_users_vunet_id'), table_name='users')
    op.drop_column('users', 'is_active')
    op.drop_column('users', 'role')
    op.drop_column('users', 'hashed_password')
    op.drop_column('users', 'vunet_id')
    userrole_enum.drop(op.get_bind(), checkfirst=True)
