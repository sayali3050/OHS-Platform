import enum


class RoleName(str, enum.Enum):
    worker = "worker"
    supervisor = "supervisor"
    admin = "admin"


class Language(str, enum.Enum):
    en = "en"
    hi = "hi"
    mr = "mr"
    de = "de"


class HealthCheckResult(str, enum.Enum):
    fit = "fit"
    fit_with_restrictions = "fit_with_restrictions"
    temporarily_unfit = "temporarily_unfit"
    unfit = "unfit"


class Shift(str, enum.Enum):
    morning = "morning"
    evening = "evening"
    night = "night"


class Severity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class RiskLevel(str, enum.Enum):
    low = "low"
    moderate = "moderate"
    high = "high"
    critical = "critical"


class IncidentStatus(str, enum.Enum):
    reported = "reported"
    assigned = "assigned"
    investigating = "investigating"
    corrective_action = "corrective_action"
    verification = "verification"
    closed = "closed"


class HazardStatus(str, enum.Enum):
    open = "open"
    in_review = "in_review"
    controlled = "controlled"
    closed = "closed"


class HazardCategory(str, enum.Enum):
    unsafe_machine = "unsafe_machine"
    slippery_floor = "slippery_floor"
    exposed_wire = "exposed_wire"
    missing_ppe = "missing_ppe"
    excessive_noise = "excessive_noise"
    poor_lighting = "poor_lighting"
    chemical_leak = "chemical_leak"
    unsafe_lifting = "unsafe_lifting"
    fire_hazard = "fire_hazard"
    blocked_exit = "blocked_exit"
    ergonomic = "ergonomic"
    other = "other"


class ActionStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    overdue = "overdue"


class Priority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class NotificationPriority(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class ChecklistAnswer(str, enum.Enum):
    yes = "yes"
    no = "no"
    not_applicable = "na"


class EmergencyType(str, enum.Enum):
    fire = "fire"
    medical = "medical"
    chemical_spill = "chemical_spill"
    machinery = "machinery"
    electrical = "electrical"
    other = "other"


class ControlLevel(str, enum.Enum):
    """Hierarchy of controls, most to least effective."""
    elimination = "elimination"
    substitution = "substitution"
    engineering = "engineering"
    administrative = "administrative"
    ppe = "ppe"
