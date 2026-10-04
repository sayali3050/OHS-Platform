"""risk wellbeing knowledge

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-04 14:30:40.695297
"""
from alembic import op
import sqlalchemy as sa


revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('knowledge_chunks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('document_id', sa.Integer(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('heading', sa.String(length=200), nullable=True),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('embedding', sa.JSON(), nullable=True),
    sa.ForeignKeyConstraint(['document_id'], ['knowledge_documents.id'], name=op.f('fk_knowledge_chunks_document_id_knowledge_documents'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_knowledge_chunks'))
    )
    with op.batch_alter_table('knowledge_chunks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_knowledge_chunks_document_id'), ['document_id'], unique=False)

    with op.batch_alter_table('drudgery_assessments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('assessed_by', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(batch_op.f('fk_drudgery_assessments_assessed_by_users'), 'users', ['assessed_by'], ['id'], ondelete='SET NULL')

    with op.batch_alter_table('knowledge_documents', schema=None) as batch_op:
        batch_op.add_column(sa.Column('original_filename', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('content_type', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('size_bytes', sa.Integer(), nullable=False, server_default='0'))

    with op.batch_alter_table('risk_assessments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('department_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('location_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('review_due', sa.Date(), nullable=True))
        batch_op.create_index(batch_op.f('ix_risk_assessments_department_id'), ['department_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_risk_assessments_review_due'), ['review_due'], unique=False)
        batch_op.create_foreign_key(batch_op.f('fk_risk_assessments_department_id_departments'), 'departments', ['department_id'], ['id'], ondelete='SET NULL')
        batch_op.create_foreign_key(batch_op.f('fk_risk_assessments_location_id_locations'), 'locations', ['location_id'], ['id'], ondelete='SET NULL')

    with op.batch_alter_table('wellbeing_checkins', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_wellbeing_checkins_user_date', ['user_id', 'checkin_date'])



def downgrade() -> None:
    with op.batch_alter_table('wellbeing_checkins', schema=None) as batch_op:
        batch_op.drop_constraint('uq_wellbeing_checkins_user_date', type_='unique')

    with op.batch_alter_table('risk_assessments', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_risk_assessments_location_id_locations'), type_='foreignkey')
        batch_op.drop_constraint(batch_op.f('fk_risk_assessments_department_id_departments'), type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_risk_assessments_review_due'))
        batch_op.drop_index(batch_op.f('ix_risk_assessments_department_id'))
        batch_op.drop_column('review_due')
        batch_op.drop_column('location_id')
        batch_op.drop_column('department_id')

    with op.batch_alter_table('knowledge_documents', schema=None) as batch_op:
        batch_op.drop_column('size_bytes')
        batch_op.drop_column('content_type')
        batch_op.drop_column('original_filename')

    with op.batch_alter_table('drudgery_assessments', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_drudgery_assessments_assessed_by_users'), type_='foreignkey')
        batch_op.drop_column('assessed_by')

    with op.batch_alter_table('knowledge_chunks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_knowledge_chunks_document_id'))

    op.drop_table('knowledge_chunks')
