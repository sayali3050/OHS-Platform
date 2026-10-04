"""Import every model so Base.metadata is complete for Alembic and create_all."""
from app.models.ai import AIConversation, AIMessage, KnowledgeDocument
from app.models.audit import AuditLog
from app.models.incidents import (
    Attachment, CorrectiveAction, Hazard, Incident, PreventiveAction, RiskAssessment,
)
from app.models.operations import (
    ChecklistResult, DrudgeryAssessment, EmergencyContact, EmergencyEvent, EmergencyResponse, ErgonomicAssessment,
    Notification,
    SafetyChecklist, WellbeingCheckin, WorkerFeedback,
)
from app.models.organization import Department, HealthCheck, Location, Role, User, Worker, WorkHistory
from app.models.ppe import PPEAssignment, PPEItem
from app.models.training import QuizAttempt, QuizQuestion, TrainingCourse, TrainingProgress, TrainingQuiz

__all__ = [
    "AIConversation", "AIMessage", "KnowledgeDocument", "AuditLog", "Attachment", "CorrectiveAction", "Hazard",
    "Incident", "PreventiveAction", "RiskAssessment", "ChecklistResult", "DrudgeryAssessment", "EmergencyEvent",
    "ErgonomicAssessment", "Notification", "SafetyChecklist", "WellbeingCheckin", "WorkerFeedback", "Department",
    "Location", "Role", "User", "Worker", "PPEAssignment", "PPEItem", "QuizAttempt", "QuizQuestion",
    "TrainingCourse", "TrainingProgress", "TrainingQuiz", "EmergencyContact", "EmergencyResponse", "HealthCheck",
    "WorkHistory",
]
