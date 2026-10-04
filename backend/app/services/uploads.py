"""Photo evidence: validate, strip metadata, store under an opaque key.

Checks, in order: count, size, magic bytes (the client's Content-Type and filename are never trusted),
then a full decode with Pillow. The image is re-encoded, which drops EXIF/XMP (including GPS position
and device serial numbers, which would undo an anonymous report) and any bytes appended to the file.
"""
import io
import secrets
import warnings
from dataclasses import dataclass
from pathlib import Path, PurePath

from fastapi import UploadFile
from PIL import Image, ImageOps

from app.core.config import get_settings
from app.models import Attachment

settings = get_settings()

MAX_SIDE = 2048           # px; phone photos are downscaled to this, plenty for evidence
MAX_PIXELS = 40_000_000   # refuse decompression bombs well before they exhaust memory

# Sniffed signature -> (content type, extension, Pillow format)
_FORMATS = {
    "jpeg": ("image/jpeg", "jpg", "JPEG"),
    "png": ("image/png", "png", "PNG"),
    "webp": ("image/webp", "webp", "WEBP"),
}


class UploadRejected(ValueError):
    pass


@dataclass
class CleanImage:
    data: bytes
    content_type: str
    extension: str
    original_filename: str


def sniff(head: bytes) -> str | None:
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


def _safe_name(name: str | None, ext: str) -> str:
    base = PurePath((name or "").replace("\\", "/")).name.strip()[:200]  # never keep a client-supplied path
    return base or f"photo.{ext}"


def clean_image(raw: bytes, filename: str | None) -> CleanImage:
    limit = settings.max_upload_mb * 1024 * 1024
    if len(raw) > limit:
        raise UploadRejected(f"Each photo must be {settings.max_upload_mb} MB or smaller.")
    kind = sniff(raw[:16])
    if kind is None:
        raise UploadRejected("Only JPEG, PNG or WebP photos can be attached.")
    content_type, ext, fmt = _FORMATS[kind]

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            Image.MAX_IMAGE_PIXELS = MAX_PIXELS
            with Image.open(io.BytesIO(raw)) as probe:
                probe.verify()  # structural check; the image must be reopened afterwards
            with Image.open(io.BytesIO(raw)) as img:
                if img.format != fmt:
                    raise UploadRejected("The file contents don't match a supported photo format.")
                img = ImageOps.exif_transpose(img)  # keep phone photos upright once EXIF is gone
                img.thumbnail((MAX_SIDE, MAX_SIDE))
                out = io.BytesIO()
                if fmt == "JPEG":
                    img.convert("RGB").save(out, "JPEG", quality=85, optimize=True)
                elif fmt == "PNG":
                    img.save(out, "PNG", optimize=True)
                else:
                    img = img if img.mode in ("RGB", "RGBA") else img.convert("RGBA")
                    img.save(out, "WEBP", quality=85)
    except UploadRejected:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise UploadRejected("This photo's resolution is too large.")
    except Exception:
        raise UploadRejected("This file couldn't be read as a photo. It may be damaged.")

    return CleanImage(out.getvalue(), content_type, ext, _safe_name(filename, ext))


def read_uploads(files: list[UploadFile] | None) -> list[CleanImage]:
    """Validate every photo before anything is written, so a bad file can't leave a half-saved report."""
    files = [f for f in files or [] if f.filename or f.size]
    if len(files) > settings.max_photos_per_report:
        raise UploadRejected(f"Attach at most {settings.max_photos_per_report} photos.")
    limit = settings.max_upload_mb * 1024 * 1024
    # Read one byte past the limit so oversized files are caught without loading them whole.
    return [clean_image(f.file.read(limit + 1), f.filename) for f in files]


def upload_root() -> Path:
    root = Path(settings.upload_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def store(image: CleanImage, *, incident_id: int | None = None, hazard_id: int | None = None,
          uploaded_by: int | None) -> Attachment:
    key = f"{secrets.token_hex(16)}.{image.extension}"
    (upload_root() / key).write_bytes(image.data)
    return Attachment(incident_id=incident_id, hazard_id=hazard_id, uploaded_by=uploaded_by, storage_key=key,
                      original_filename=image.original_filename, content_type=image.content_type,
                      size_bytes=len(image.data))


def path_for(attachment: Attachment) -> Path:
    path = (upload_root() / attachment.storage_key).resolve()
    if path.parent != upload_root().resolve():  # storage keys are generated, but never follow one out of the store
        raise FileNotFoundError(attachment.storage_key)
    return path


# --- voice notes ------------------------------------------------------------------------------------------------
# Audio can't be re-encoded without ffmpeg, so it is checked by signature and size, stored under a random key and
# served with nosniff like photos. Browsers record WebM/Opus (Chrome, Firefox) or MP4/AAC (Safari).

_AUDIO = {
    "webm": ("audio/webm", "webm"),
    "ogg": ("audio/ogg", "ogg"),
    "mp4": ("audio/mp4", "m4a"),
    "wav": ("audio/wav", "wav"),
    "mpeg": ("audio/mpeg", "mp3"),
}


@dataclass
class CleanAudio:
    data: bytes
    content_type: str
    extension: str
    original_filename: str


def sniff_audio(head: bytes) -> str | None:
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return "webm"
    if head.startswith(b"OggS"):
        return "ogg"
    if head[4:8] == b"ftyp":
        return "mp4"
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "wav"
    if head.startswith(b"ID3") or (len(head) > 1 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0):
        return "mpeg"
    return None


def read_voice(file: UploadFile | None) -> CleanAudio | None:
    if file is None or not (file.filename or file.size):
        return None
    limit = settings.max_voice_mb * 1024 * 1024
    raw = file.file.read(limit + 1)
    if len(raw) > limit:
        raise UploadRejected(f"The voice note must be {settings.max_voice_mb} MB or smaller (about 5 minutes).")
    if len(raw) < 64:
        raise UploadRejected("The voice note is empty. Record it again.")
    kind = sniff_audio(raw[:16])
    if kind is None:
        raise UploadRejected("The voice note isn't in a supported audio format.")
    content_type, ext = _AUDIO[kind]
    return CleanAudio(raw, content_type, ext, _safe_name(file.filename, ext).rsplit(".", 1)[0] + f".{ext}")


def store_audio(audio: CleanAudio, *, incident_id: int | None = None, hazard_id: int | None = None,
                emergency_event_id: int | None = None, uploaded_by: int | None) -> Attachment:
    key = f"{secrets.token_hex(16)}.{audio.extension}"
    (upload_root() / key).write_bytes(audio.data)
    return Attachment(incident_id=incident_id, hazard_id=hazard_id, emergency_event_id=emergency_event_id,
                      uploaded_by=uploaded_by, storage_key=key, original_filename=audio.original_filename,
                      content_type=audio.content_type, size_bytes=len(audio.data))
