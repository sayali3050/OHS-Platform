import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import get_settings

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")

app = FastAPI(
    title=settings.app_name,
    description="AI-powered Occupational Health & Safety platform API. "
                "Authenticate via **POST /api/auth/login**, then click *Authorize* and paste the token.",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    # Flatten Pydantic errors into {field: message} so forms can show them inline.
    fields = {".".join(str(p) for p in e["loc"][1:]) or "body": e["msg"].removeprefix("Value error, ")
              for e in exc.errors()}
    return JSONResponse(status_code=422, content={"detail": "Some fields need attention.", "fields": fields})


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on the server. It has been logged."})


app.include_router(api_router, prefix=settings.api_prefix)
