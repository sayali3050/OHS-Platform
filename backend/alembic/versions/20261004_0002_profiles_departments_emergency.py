"""profiles departments emergency roll call voice notes

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-04 00:45:48.288939
"""
from alembic import op
import sqlalchemy as sa


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('emergency_contacts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('label', sa.String(length=80), nullable=False),
    sa.Column('phone', sa.String(length=32), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_emergency_contacts'))
    )
    op.create_table('health_checks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('check_type', sa.String(length=40), nullable=False),
    sa.Column('checked_on', sa.Date(), nullable=False),
    sa.Column('result', sa.Enum('fit', 'fit_with_restrictions', 'temporarily_unfit', 'unfit', name='healthcheckresult_enum', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('blood_pressure', sa.String(length=16), nullable=True),
    sa.Column('pulse', sa.Integer(), nullable=True),
    sa.Column('vision', sa.String(length=40), nullable=True),
    sa.Column('hearing', sa.String(length=40), nullable=True),
    sa.Column('examiner', sa.String(length=120), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('next_due_on', sa.Date(), nullable=True),
    sa.Column('recorded_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['recorded_by'], ['users.id'], name=op.f('fk_health_checks_recorded_by_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_health_checks_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_health_checks'))
    )
    with op.batch_alter_table('health_checks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_health_checks_checked_on'), ['checked_on'], unique=False)
        batch_op.create_index(batch_op.f('ix_health_checks_next_due_on'), ['next_due_on'], unique=False)
        batch_op.create_index(batch_op.f('ix_health_checks_user_id'), ['user_id'], unique=False)

    op.create_table('work_history',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('employer', sa.String(length=160), nullable=False),
    sa.Column('role_title', sa.String(length=120), nullable=False),
    sa.Column('from_date', sa.Date(), nullable=True),
    sa.Column('to_date', sa.Date(), nullable=True),
    sa.Column('notes', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_work_history_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_work_history'))
    )
    with op.batch_alter_table('work_history', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_work_history_user_id'), ['user_id'], unique=False)

    op.create_table('emergency_responses',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('event_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('responded_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['event_id'], ['emergency_events.id'], name=op.f('fk_emergency_responses_event_id_emergency_events'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_emergency_responses_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_emergency_responses')),
    sa.UniqueConstraint('event_id', 'user_id', name='uq_emergency_responses_event_user')
    )
    with op.batch_alter_table('emergency_responses', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_emergency_responses_event_id'), ['event_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_emergency_responses_user_id'), ['user_id'], unique=False)

    with op.batch_alter_table('attachments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('emergency_event_id', sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f('ix_attachments_emergency_event_id'), ['emergency_event_id'], unique=False)
        batch_op.create_foreign_key(batch_op.f('fk_attachments_emergency_event_id_emergency_events'), 'emergency_events', ['emergency_event_id'], ['id'], ondelete='CASCADE')

    with op.batch_alter_table('departments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('head_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('building', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('shift_pattern', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('working_hours', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('contact_phone', sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column('risk_level', sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column('main_activities', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('machinery', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('key_hazards', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('required_ppe', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('assembly_point', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('first_aid_point', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('fire_equipment', sa.String(length=300), nullable=True))
        batch_op.create_foreign_key(batch_op.f('fk_departments_head_id_users'), 'users', ['head_id'], ['id'], ondelete='SET NULL')

    with op.batch_alter_table('emergency_events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('resolution_note', sa.Text(), nullable=True))

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('designation', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('date_of_birth', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('gender', sa.String(length=24), nullable=True))
        batch_op.add_column(sa.Column('blood_group', sa.String(length=8), nullable=True))
        batch_op.add_column(sa.Column('address', sa.String(length=300), nullable=True))
        batch_op.add_column(sa.Column('date_of_joining', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('qualification', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('experience_years', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('emergency_contact_name', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('emergency_contact_relation', sa.String(length=60), nullable=True))
        batch_op.add_column(sa.Column('emergency_contact_phone', sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column('medical_notes', sa.Text(), nullable=True))



def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('medical_notes')
        batch_op.drop_column('emergency_contact_phone')
        batch_op.drop_column('emergency_contact_relation')
        batch_op.drop_column('emergency_contact_name')
        batch_op.drop_column('experience_years')
        batch_op.drop_column('qualification')
        batch_op.drop_column('date_of_joining')
        batch_op.drop_column('address')
        batch_op.drop_column('blood_group')
        batch_op.drop_column('gender')
        batch_op.drop_column('date_of_birth')
        batch_op.drop_column('designation')

    with op.batch_alter_table('emergency_events', schema=None) as batch_op:
        batch_op.drop_column('resolution_note')

    with op.batch_alter_table('departments', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_departments_head_id_users'), type_='foreignkey')
        batch_op.drop_column('fire_equipment')
        batch_op.drop_column('first_aid_point')
        batch_op.drop_column('assembly_point')
        batch_op.drop_column('required_ppe')
        batch_op.drop_column('key_hazards')
        batch_op.drop_column('machinery')
        batch_op.drop_column('main_activities')
        batch_op.drop_column('risk_level')
        batch_op.drop_column('contact_phone')
        batch_op.drop_column('working_hours')
        batch_op.drop_column('shift_pattern')
        batch_op.drop_column('building')
        batch_op.drop_column('head_id')

    with op.batch_alter_table('attachments', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_attachments_emergency_event_id_emergency_events'), type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_attachments_emergency_event_id'))
        batch_op.drop_column('emergency_event_id')

    with op.batch_alter_table('emergency_responses', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_emergency_responses_user_id'))
        batch_op.drop_index(batch_op.f('ix_emergency_responses_event_id'))

    op.drop_table('emergency_responses')
    with op.batch_alter_table('work_history', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_work_history_user_id'))

    op.drop_table('work_history')
    with op.batch_alter_table('health_checks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_health_checks_user_id'))
        batch_op.drop_index(batch_op.f('ix_health_checks_next_due_on'))
        batch_op.drop_index(batch_op.f('ix_health_checks_checked_on'))

    op.drop_table('health_checks')
    op.drop_table('emergency_contacts')
