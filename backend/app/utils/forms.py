from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError


def parse_json_field[M: BaseModel](model: type[M], raw: str) -> M:
    """Validate the JSON `payload` part of a multipart request (report fields travel next to the photo files).

    Errors are re-raised as a normal request validation error, so the client gets the same {field: message}
    shape it gets from JSON endpoints.
    """
    try:
        return model.model_validate_json(raw)
    except ValidationError as e:
        raise RequestValidationError([{**err, "loc": ("body", *err["loc"])} for err in e.errors()])


def field_error(field: str, message: str) -> RequestValidationError:
    """A business-rule failure on one field, shaped like any other validation error."""
    return RequestValidationError([{"loc": ("body", field), "msg": message, "type": "value_error"}])
