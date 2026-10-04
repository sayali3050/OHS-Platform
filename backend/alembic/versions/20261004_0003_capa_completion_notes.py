"""capa completion notes

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-04 11:31:51.683000
"""
from alembic import op
import sqlalchemy as sa


revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('corrective_actions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('completion_note', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('created_by', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(batch_op.f('fk_corrective_actions_created_by_users'), 'users', ['created_by'], ['id'], ondelete='SET NULL')

    with op.batch_alter_table('preventive_actions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('completion_note', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('created_by', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(batch_op.f('fk_preventive_actions_created_by_users'), 'users', ['created_by'], ['id'], ondelete='SET NULL')



def downgrade() -> None:
    with op.batch_alter_table('preventive_actions', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_preventive_actions_created_by_users'), type_='foreignkey')
        batch_op.drop_column('created_by')
        batch_op.drop_column('completion_note')

    with op.batch_alter_table('corrective_actions', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_corrective_actions_created_by_users'), type_='foreignkey')
        batch_op.drop_column('created_by')
        batch_op.drop_column('completion_note')

