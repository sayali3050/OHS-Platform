"""Outgoing email. Optional: with no SMTP_HOST configured nothing is sent and callers fall back (reset links are
written to the API log, and staff can issue a temporary password instead)."""
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings

log = logging.getLogger(__name__)


def enabled() -> bool:
    return bool(get_settings().smtp_host)


def send(to: str, subject: str, body: str) -> bool:
    """Send a plain-text email. Returns False (and logs why) instead of raising, so a mail outage never breaks a request."""
    s = get_settings()
    if not s.smtp_host:
        return False
    msg = EmailMessage()
    msg["From"] = s.smtp_from or s.smtp_user
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
            if s.smtp_tls:
                smtp.starttls()
            if s.smtp_user:
                smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(msg)
        return True
    except (OSError, smtplib.SMTPException) as e:
        log.error("Could not send email to %s: %s", to, e)
        return False
