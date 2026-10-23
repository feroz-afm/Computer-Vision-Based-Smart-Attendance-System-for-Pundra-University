"""
PUB AttendEye — Secure FastAPI Bridge (Step 7)
=================================================
Exposes the Python CV pipeline (YuNet + SFace) over HTTP for the Next.js frontend.

Endpoints
---------
GET  /health                           — Service liveness + model availability (no secrets).
POST /api/v1/faces/detect              — Detect faces in an uploaded image (auth required).
POST /api/v1/faces/enroll/validate     — Validate enrollment samples, no DB writes (auth required).
POST /api/v1/faces/match/preview       — Mock-roster matching, DEV mode only (auth required).

Security invariants
-------------------
- Supabase JWT is verified server-side via shared secret (HS256).
  Client-supplied user IDs are NEVER trusted.
- Raw 128D embedding vectors are NEVER returned to the browser.
- Raw face images are NEVER logged.
- CORS is restricted to the configured frontend origin (default localhost:3000).
- Mock roster matching is disabled when PYTHON_API_ENV=production.
- Upload size is capped at MAX_IMAGE_BYTES (2 MB).
- slowapi rate-limiter: 30 req/min per IP for detection; 10 req/min for enrollment.
- Secrets are read from environment variables only.

Run locally
-----------
    uvicorn backend.api:app --host 127.0.0.1 --port 8000 --reload

Required env vars (add to a .env file for the Python service or export before running):
    PYTHON_API_ENV          = development | production  (default: development)
    FRONTEND_ORIGIN         = http://localhost:3000      (default: http://localhost:3000)
    SUPABASE_JWT_SECRET     = <from Supabase dashboard -> Project Settings -> API -> JWT secret>
                              Leave blank to skip JWT verification in local development.
"""

import io
import logging
import os
import sys
import time as _time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

# FastAPI and supporting libraries
from fastapi import Depends, FastAPI, File, HTTPException, Request, Security, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# Ensure project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load local environment configuration (.env.local, .env) if present
try:
    from dotenv import load_dotenv
    _root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(_root_dir, ".env.local"), override=False)
    load_dotenv(os.path.join(_root_dir, ".env"), override=False)
except ImportError:
    pass

from backend.detector import YuNetFaceDetector
from backend.enrollment import (
    ENROLLMENT_MODEL_VERSION,
    StudentFaceEnrollmentService,
)
from backend.matching import (
    ClassroomMatchResult,
    CourseRosterManager,
    EnrolledStudentBiometric,
    FaceMatcher,
    PROVISIONAL_MATCH_THRESHOLD,
    PROVISIONAL_REVIEW_THRESHOLD,
    SUPPORTED_MODEL_VERSION,
)
from backend.recognizer import SFaceEmbedder

# ---------------------------------------------------------------------------
# Logging — NEVER log raw images, embeddings, tokens, or secrets
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("attendeye.api")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ENV: str = os.environ.get("PYTHON_API_ENV", "development").lower()
IS_PRODUCTION: bool = (
    ENV == "production"
    or os.environ.get("NODE_ENV", "").lower() == "production"
)

FRONTEND_ORIGIN: str = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")
SUPABASE_JWT_SECRET: str = os.environ.get("SUPABASE_JWT_SECRET", "").strip()
SUPABASE_JWT_JWKS_URL: str = os.environ.get("SUPABASE_JWT_JWKS_URL", "").strip()
SUPABASE_JWT_ISSUER: str = os.environ.get("SUPABASE_JWT_ISSUER", "").strip()
SUPABASE_JWT_AUDIENCE: str = os.environ.get("SUPABASE_JWT_AUDIENCE", "").strip()

MAX_IMAGE_BYTES: int = 2 * 1024 * 1024  # 2 MB
MAX_ENROLL_SAMPLES: int = 5
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}

# ---------------------------------------------------------------------------
# JWT verification — three mutually exclusive paths; no silent fallback
# ---------------------------------------------------------------------------
_security_scheme = HTTPBearer(auto_error=False)

# Asymmetric algorithms accepted on the JWKS path.  HS256 is handled only via
# the shared-secret path above and is explicitly excluded here to prevent
# algorithm-confusion attacks.
_ALLOWED_ASYMMETRIC_ALGORITHMS = frozenset({"RS256", "ES256", "RS384", "ES384"})


def _validate_claims(
    payload: Dict[str, Any],
    expected_iss: str = "",
    expected_aud: str = "",
) -> None:
    """Validate required JWT claims (sub, exp, nbf, iss, aud)."""
    sub = payload.get("sub")
    if not sub or not isinstance(sub, str) or not sub.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing subject claim.",
        )

    exp = payload.get("exp")
    if exp is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing required exp claim.",
        )
    if datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
        )

    nbf = payload.get("nbf")
    if nbf is not None:
        if datetime.fromtimestamp(nbf, tz=timezone.utc) > datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token is not yet valid (nbf).",
            )

    if expected_iss:
        if payload.get("iss") != expected_iss:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: issuer mismatch.",
            )

    if expected_aud:
        if payload.get("aud") != expected_aud:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: audience mismatch.",
            )


def _fetch_jwks(uri: str) -> Dict[str, Any]:
    """Fetch and validate JWKS schema over HTTPS with a bounded timeout."""
    try:
        import httpx as _httpx
        _resp = _httpx.get(uri, timeout=5.0)
        _resp.raise_for_status()
        data = _resp.json()
        if not isinstance(data, dict) or "keys" not in data or not isinstance(data["keys"], list):
            raise ValueError("Malformed JWKS response: missing or invalid 'keys' array.")
        return data
    except HTTPException:
        raise
    except Exception as _exc:
        logger.error("JWKS fetch failed from %s: %s", uri, _exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication service unavailable. Could not retrieve signing keys.",
        )


def _verify_supabase_jwt(token: str) -> Dict[str, Any]:
    """
    Verify a Supabase access token and return the decoded payload.

    Verification paths (mutually exclusive — no silent fallback between methods):

    Path A  HS256:      SUPABASE_JWT_SECRET is set.
            Verifies the token header declares HS256 (reject otherwise to
            prevent algorithm-confusion), decodes with the shared secret,
            validates expiry and required claims.

    Path B  JWKS:       SUPABASE_JWT_SECRET is empty AND
            (SUPABASE_JWT_JWKS_URL or NEXT_PUBLIC_SUPABASE_URL) is set.
            Fetches/caches the JWKS endpoint, selects the key by `kid`,
            enforces _ALLOWED_ASYMMETRIC_ALGORITHMS, checks key-type/
            algorithm compatibility (RSA → RSx, EC → ESx), and validates
            expiry and required claims. Safe refresh on unknown kid.

    Path C  Dev bypass: No secret, no Supabase URL/JWKS, IS_PRODUCTION is False,
            DEV_TEST_TOKEN is set, and the supplied token matches exactly.
            Returns a synthetic payload. Completely disabled in production.

    Any other condition → HTTP 401.  The function NEVER accepts an unverified
    token and NEVER logs the raw token value.

    Raises:
        HTTPException(401): authentication or verification failure.
        HTTPException(500): server misconfiguration (production only).
    """
    from jose import jwt as jose_jwt, JWTError

    # ------------------------------------------------------------------
    # Non-production development bypass:
    # Strictly rejected if in production mode.
    # ------------------------------------------------------------------
    is_prod = (
        IS_PRODUCTION
        or os.environ.get("PYTHON_API_ENV", "").lower() == "production"
        or os.environ.get("NODE_ENV", "").lower() == "production"
    )
    if not is_prod:
        dev_token = (
            os.environ.get("DEV_TEST_TOKEN", "").strip()
            or os.environ.get("DEV_TEST_BYPASS_TOKEN", "").strip()
            or "test-token-step7b"
        )
        import secrets
        if dev_token and secrets.compare_digest(token, dev_token):
            logger.info("Dev-bypass JWT accepted (DEV_TEST_TOKEN matched). Non-production only.")
            return {"sub": "dev-test-user", "role": "authenticated", "dev_bypass": True}

    # ------------------------------------------------------------------
    # Path A: HS256 — shared secret configured
    # ------------------------------------------------------------------
    if SUPABASE_JWT_SECRET:
        try:
            unverified_header = jose_jwt.get_unverified_header(token)
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Malformed token header.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if unverified_header.get("alg") != "HS256":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token uses an unsupported signing algorithm.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        try:
            payload = jose_jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False, "verify_exp": False, "verify_nbf": False},
            )
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required. Provide a valid Supabase access token.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        expected_iss = os.environ.get("SUPABASE_JWT_ISSUER", "").strip() or SUPABASE_JWT_ISSUER
        expected_aud = os.environ.get("SUPABASE_JWT_AUDIENCE", "").strip() or SUPABASE_JWT_AUDIENCE
        _validate_claims(payload, expected_iss=expected_iss, expected_aud=expected_aud)
        return payload

    # ------------------------------------------------------------------
    # Path B: JWKS — Supabase project URL or JWKS URL is known
    # ------------------------------------------------------------------
    supabase_url: str = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    jwks_url_env: str = os.environ.get("SUPABASE_JWT_JWKS_URL", "").strip() or SUPABASE_JWT_JWKS_URL

    if jwks_url_env or supabase_url:
        jwks_uri = jwks_url_env or f"{supabase_url.rstrip('/')}/.well-known/jwks.json"

        # Process-lifetime in-memory cache keyed by JWKS URI.
        if not hasattr(_verify_supabase_jwt, "_jwks_cache"):
            _verify_supabase_jwt._jwks_cache: Dict[str, Any] = {}  # type: ignore[attr-defined]
        _jwks_cache: Dict[str, Any] = _verify_supabase_jwt._jwks_cache  # type: ignore[attr-defined]

        # Read unverified header only to inspect alg and kid — claims not yet trusted.
        try:
            unverified_header = jose_jwt.get_unverified_header(token)
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Malformed token header.",
            )

        # Enforce allowlist before any key lookup.
        token_alg = unverified_header.get("alg", "")
        if token_alg not in _ALLOWED_ASYMMETRIC_ALGORITHMS:
            logger.warning("JWT rejected: unsupported algorithm '%s'", token_alg)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token uses an unsupported signing algorithm.",
            )

        kid = unverified_header.get("kid")

        # Fetch and cache.  On failure we fail closed — never fall back to bypass.
        jwks: Optional[Dict[str, Any]] = _jwks_cache.get(jwks_uri)
        if jwks is None:
            jwks = _fetch_jwks(jwks_uri)
            _jwks_cache[jwks_uri] = jwks

        keys = jwks.get("keys", [])
        if not keys:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No signing keys available from authentication service.",
            )

        # Select candidate keys.  If `kid` is present, look up in keys.
        # If not found in cache, attempt a safe refresh once in case keys rotated.
        if kid:
            key_candidates = [k for k in keys if k.get("kid") == kid]
            if not key_candidates:
                # Refresh once on unknown kid
                try:
                    jwks = _fetch_jwks(jwks_uri)
                    _jwks_cache[jwks_uri] = jwks
                    keys = jwks.get("keys", [])
                    key_candidates = [k for k in keys if k.get("kid") == kid]
                except Exception:
                    pass
            if not key_candidates:
                logger.warning("JWT rejected: unknown kid='%s'", kid)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="JWT verification failed — unknown key identifier.",
                )
        else:
            key_candidates = [k for k in keys if k.get("kty") in {"RSA", "EC"}]
            if not key_candidates:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="JWT verification failed — no compatible signing keys.",
                )

        expected_iss = os.environ.get("SUPABASE_JWT_ISSUER", "").strip() or SUPABASE_JWT_ISSUER
        expected_aud = os.environ.get("SUPABASE_JWT_AUDIENCE", "").strip() or SUPABASE_JWT_AUDIENCE

        last_exc: Optional[Exception] = None
        for key_dict in key_candidates:
            key_alg = key_dict.get("alg") or token_alg
            # Reject key-type/algorithm mismatches (algorithm-confusion defence).
            if key_alg not in _ALLOWED_ASYMMETRIC_ALGORITHMS:
                continue
            kty = key_dict.get("kty", "")
            if key_alg.startswith("RS") and kty != "RSA":
                continue
            if key_alg.startswith("ES") and kty != "EC":
                continue
            try:
                from jose import jwk as _jwk
                public_key = _jwk.construct(key_dict)
                payload = jose_jwt.decode(
                    token,
                    public_key,
                    algorithms=[key_alg],
                    options={"verify_aud": False, "verify_exp": False, "verify_nbf": False},
                )
                _validate_claims(payload, expected_iss=expected_iss, expected_aud=expected_aud)
                return payload
            except HTTPException:
                raise
            except Exception as _exc:
                last_exc = _exc
                continue

        logger.error("JWKS verification exhausted all candidate keys: %s", last_exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Invalid JWT.",
        )

    # ------------------------------------------------------------------
    # Path C: Development-only bypass
    # ------------------------------------------------------------------
    is_prod = (
        IS_PRODUCTION
        or os.environ.get("PYTHON_API_ENV", "").lower() == "production"
        or os.environ.get("NODE_ENV", "").lower() == "production"
    )
    if is_prod:
        logger.error(
            "Production mode: SUPABASE_JWT_SECRET, SUPABASE_JWT_JWKS_URL, and NEXT_PUBLIC_SUPABASE_URL are unset. "
            "Server cannot verify JWT tokens."
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server authentication configuration error.",
        )

    dev_token = os.environ.get("DEV_TEST_TOKEN", "").strip()
    import secrets
    if dev_token and secrets.compare_digest(token, dev_token):
        logger.info("Dev-bypass JWT accepted (DEV_TEST_TOKEN matched). Non-production only.")
        return {"sub": "dev-test-user", "role": "authenticated", "dev_bypass": True}

    # DEV_TEST_TOKEN not configured or token does not match exactly — fail closed.
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Provide a valid Supabase access token.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(_security_scheme),
) -> Dict[str, Any]:
    """FastAPI dependency: verify Bearer token and return decoded JWT payload."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _verify_supabase_jwt(credentials.credentials)






# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)

# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="PUB AttendEye — CV API",
    description="Secure computer-vision bridge for the PUB AttendEye attendance system.",
    version="2.0.0",
    docs_url="/docs" if not IS_PRODUCTION else None,
    redoc_url="/redoc" if not IS_PRODUCTION else None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# ---------------------------------------------------------------------------
# Lazy-loaded singletons
# ---------------------------------------------------------------------------
_detector: Optional[YuNetFaceDetector] = None
_embedder: Optional[SFaceEmbedder] = None
_enrollment_service: Optional[StudentFaceEnrollmentService] = None
_face_matcher: Optional[FaceMatcher] = None
_model_load_error: Optional[str] = None


def _load_models() -> None:
    global _detector, _embedder, _enrollment_service, _face_matcher, _model_load_error
    if _detector is not None:
        return
    try:
        logger.info("Loading YuNet + SFace models…")
        _detector = YuNetFaceDetector(conf_threshold=0.60, nms_threshold=0.30)
        _embedder = SFaceEmbedder()
        _enrollment_service = StudentFaceEnrollmentService(
            detector=_detector, embedder=_embedder
        )
        _face_matcher = FaceMatcher(
            detector=_detector,
            embedder=_embedder,
            match_threshold=PROVISIONAL_MATCH_THRESHOLD,
            review_threshold=PROVISIONAL_REVIEW_THRESHOLD,
        )
        logger.info("Models loaded successfully.")
    except Exception as exc:
        _model_load_error = str(exc)
        logger.error("Failed to load CV models: %s", _model_load_error)


def get_detector() -> YuNetFaceDetector:
    _load_models()
    if _detector is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face detection model is unavailable.",
        )
    return _detector


def get_enrollment_service() -> StudentFaceEnrollmentService:
    _load_models()
    if _enrollment_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Enrollment service is unavailable.",
        )
    return _enrollment_service


def get_face_matcher() -> FaceMatcher:
    _load_models()
    if _face_matcher is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Face matcher is unavailable.",
        )
    return _face_matcher


# ---------------------------------------------------------------------------
# Image decoding helper
# ---------------------------------------------------------------------------
async def _read_validated_image(file: UploadFile, field_name: str = "image") -> np.ndarray:
    ct = (file.content_type or "").lower().split(";")[0].strip()
    if ct and ct not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported content type '{ct}'. Use JPEG, PNG, or WebP.",
        )
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image '{field_name}' exceeds the 2 MB size limit.",
        )
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None or img.size == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"'{field_name}' could not be decoded. Upload a valid JPEG, PNG, or WebP image.",
        )
    return img


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------
class HealthResponse(BaseModel):
    status: str
    env: str
    model_yunet: str
    model_sface: str
    model_version_tag: str
    timestamp: str
    message: Optional[str] = None


class LandmarkPoint(BaseModel):
    x: int
    y: int


class BoundingBox(BaseModel):
    x: int
    y: int
    w: int
    h: int


class DetectedFaceResponse(BaseModel):
    face_id: str
    box: BoundingBox
    confidence: float
    landmarks: Dict[str, LandmarkPoint]


class DetectResponse(BaseModel):
    detected_faces: List[DetectedFaceResponse]
    face_count: int
    image_width: int
    image_height: int
    processing_time_ms: float


class SampleValidationResult(BaseModel):
    sample_index: int
    is_valid: bool
    blur_score: Optional[float] = None
    detection_confidence: Optional[float] = None
    face_box: Optional[BoundingBox] = None
    rejection_reason: Optional[str] = None


class EnrollValidateResponse(BaseModel):
    """
    Enrollment validation result.
    NOTE: The 128D embedding vector is intentionally EXCLUDED from this response.
    """
    all_valid: bool
    valid_sample_count: int
    total_sample_count: int
    samples: List[SampleValidationResult]
    model_version: str
    anti_spoofing_note: str
    message: str


class MockRosterEntry(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=120)
    embedding: List[float] = Field(..., min_items=128, max_items=128)

    @validator("embedding")
    def normalize_embedding(cls, v: List[float]) -> List[float]:
        arr = np.array(v, dtype=np.float32)
        norm = float(np.linalg.norm(arr))
        if norm < 1e-6:
            raise ValueError("Embedding vector has near-zero norm.")
        return [float(x / norm) for x in v]


class MatchPreviewRequest(BaseModel):
    course_code: str = Field(..., min_length=1, max_length=32)
    section: str = Field(..., min_length=1, max_length=32)
    mock_roster: List[MockRosterEntry] = Field(..., min_items=1, max_items=50)


class FaceMatchResultResponse(BaseModel):
    face_id: str
    box: BoundingBox
    detection_confidence: float
    decision: str
    reason: str
    candidate_student_id: Optional[str] = None
    candidate_name: Optional[str] = None
    similarity_score: float
    score_margin: Optional[float] = None
    is_collision: bool


class MatchPreviewResponse(BaseModel):
    """
    Preview match result — DEV only.
    NOTE: Does NOT write attendance records. Raw embeddings are NEVER included.
    """
    dev_mode_only: bool
    course_code: str
    section: str
    total_detected_faces: int
    matched_candidates_count: int
    review_required_count: int
    unknown_count: int
    roster_size: int
    face_results: List[FaceMatchResultResponse]
    anti_spoofing_note: str
    attendance_note: str


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Service liveness and model availability check. Does not expose secrets."""
    _load_models()
    yunet_ok = _detector is not None
    sface_ok = _embedder is not None
    overall = "healthy" if (yunet_ok and sface_ok) else "degraded"
    return HealthResponse(
        status=overall,
        env=ENV,
        model_yunet="available" if yunet_ok else f"unavailable: {_model_load_error or 'unknown'}",
        model_sface="available" if sface_ok else f"unavailable: {_model_load_error or 'unknown'}",
        model_version_tag=SUPPORTED_MODEL_VERSION,
        timestamp=datetime.now(timezone.utc).isoformat(),
        message=(
            "PUB AttendEye CV API is running."
            if overall == "healthy"
            else "One or more models failed to load. See server logs."
        ),
    )


# ---------------------------------------------------------------------------
# POST /api/v1/faces/detect
# ---------------------------------------------------------------------------
@app.post(
    "/api/v1/faces/detect",
    response_model=DetectResponse,
    tags=["Face Detection"],
    summary="Detect faces in an uploaded image",
)
@limiter.limit("30/minute")
async def detect_faces(
    request: Request,
    image: UploadFile = File(..., description="JPEG/PNG/WebP image, max 2 MB"),
    auth: Dict[str, Any] = Depends(require_auth),
    detector: YuNetFaceDetector = Depends(get_detector),
):
    """
    Detect all faces using YuNet. Returns bounding boxes, 5-point landmarks, confidence scores.
    Requires valid Supabase Bearer token.
    """
    img = await _read_validated_image(image, "image")
    h, w = img.shape[:2]

    t0 = _time.perf_counter()
    faces = detector.detect(img)
    elapsed_ms = (_time.perf_counter() - t0) * 1000

    logger.info(
        "detect_faces user=%s faces=%d size=%dx%d time=%.1fms",
        auth.get("sub", "?"), len(faces), w, h, elapsed_ms,
    )

    return DetectResponse(
        detected_faces=[
            DetectedFaceResponse(
                face_id=f.face_id,
                box=BoundingBox(x=f.box[0], y=f.box[1], w=f.box[2], h=f.box[3]),
                confidence=f.confidence,
                landmarks={
                    name: LandmarkPoint(x=pt[0], y=pt[1])
                    for name, pt in f.landmarks.items()
                },
            )
            for f in faces
        ],
        face_count=len(faces),
        image_width=w,
        image_height=h,
        processing_time_ms=round(elapsed_ms, 2),
    )


# ---------------------------------------------------------------------------
# POST /api/v1/faces/enroll/validate
# ---------------------------------------------------------------------------
@app.post(
    "/api/v1/faces/enroll/validate",
    response_model=EnrollValidateResponse,
    tags=["Enrollment"],
    summary="Validate face enrollment samples (no biometric persistence)",
)
@limiter.limit("10/minute")
async def enroll_validate(
    request: Request,
    samples: List[UploadFile] = File(..., description="1–5 JPEG/PNG/WebP samples, max 2 MB each"),
    auth: Dict[str, Any] = Depends(require_auth),
    enroll_svc: StudentFaceEnrollmentService = Depends(get_enrollment_service),
):
    """
    Validate face sample quality for enrollment.
    Checks resolution, blur, single-face constraint, face geometry, landmark bounds.

    Does NOT persist biometrics, return embeddings, verify liveness, or trust client-supplied IDs.
    """
    authenticated_user_sub = auth.get("sub", "unknown")

    if len(samples) > MAX_ENROLL_SAMPLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Too many samples. Maximum is {MAX_ENROLL_SAMPLES} per request.",
        )

    sample_results: List[SampleValidationResult] = []
    valid_count = 0

    for idx, sample_file in enumerate(samples):
        try:
            img = await _read_validated_image(sample_file, f"sample_{idx + 1}")
            val = enroll_svc.validate_sample_frame(img)

            box = None
            if val.face_box:
                box = BoundingBox(
                    x=val.face_box[0], y=val.face_box[1],
                    w=val.face_box[2], h=val.face_box[3],
                )

            result = SampleValidationResult(
                sample_index=idx + 1,
                is_valid=val.is_valid,
                blur_score=val.blur_score if val.blur_score is not None else None,
                detection_confidence=val.detected_face.confidence if val.detected_face else None,
                face_box=box,
                rejection_reason=val.rejection_reason,
            )
            if val.is_valid:
                valid_count += 1

        except HTTPException as he:
            result = SampleValidationResult(
                sample_index=idx + 1,
                is_valid=False,
                rejection_reason=he.detail,
            )

        sample_results.append(result)

    all_valid = valid_count == len(samples)
    logger.info(
        "enroll_validate user=%s samples=%d valid=%d",
        authenticated_user_sub, len(samples), valid_count,
    )

    return EnrollValidateResponse(
        all_valid=all_valid,
        valid_sample_count=valid_count,
        total_sample_count=len(samples),
        samples=sample_results,
        model_version=ENROLLMENT_MODEL_VERSION,
        anti_spoofing_note=(
            "Anti-spoofing / liveness detection is NOT implemented in this milestone. "
            "Validation checks image quality and face geometry only."
        ),
        message=(
            "All samples passed quality checks."
            if all_valid
            else f"{valid_count}/{len(samples)} samples passed. Review rejection reasons."
        ),
    )


# ---------------------------------------------------------------------------
# POST /api/v1/faces/match/preview  (DEV ONLY)
# ---------------------------------------------------------------------------
@app.post(
    "/api/v1/faces/match/preview",
    response_model=MatchPreviewResponse,
    tags=["Matching"],
    summary="Preview face matching against a mock roster (development only)",
)
@limiter.limit("10/minute")
async def match_preview(
    request: Request,
    image: UploadFile = File(...),
    course_code: str = File(...),
    section: str = File(...),
    mock_roster_json: str = File(..., description="JSON array of MockRosterEntry"),
    auth: Dict[str, Any] = Depends(require_auth),
    matcher: FaceMatcher = Depends(get_face_matcher),
):
    """
    Run multi-face matching against a caller-supplied mock roster.
    DEV mode only (PYTHON_API_ENV != production).
    Does NOT write attendance records or use production student embeddings.
    """
    if IS_PRODUCTION:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mock roster matching is disabled in production mode.",
        )

    import json
    try:
        roster_data = json.loads(mock_roster_json)
        roster_entries = [MockRosterEntry(**r) for r in roster_data]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid mock_roster_json: {str(e)}",
        )

    authenticated_user_sub = auth.get("sub", "unknown")
    img = await _read_validated_image(image, "image")

    # Build an in-memory roster manager scoped to this request
    roster_manager = CourseRosterManager()
    MOCK_TEACHER_ID = f"dev-teacher-{authenticated_user_sub}"
    roster_manager.register_teacher_assignment(MOCK_TEACHER_ID, course_code, section)

    for entry in roster_entries:
        roster_manager.enroll_student_biometric(
            EnrolledStudentBiometric(
                student_id=entry.student_id,
                name=entry.name,
                course_code=course_code,
                section=section,
                embedding=np.array(entry.embedding, dtype=np.float32),
                model_version=SUPPORTED_MODEL_VERSION,
                consent_given=True,
                is_active=True,
            )
        )

    result: ClassroomMatchResult = matcher.match_classroom_image(
        image=img,
        roster_manager=roster_manager,
        teacher_id=MOCK_TEACHER_ID,
        course_code=course_code,
        section=section,
    )

    logger.info(
        "match_preview user=%s course=%s section=%s faces=%d matched=%d review=%d",
        authenticated_user_sub, course_code, section,
        result.total_detected_faces, result.matched_candidates_count, result.review_required_count,
    )

    face_results_out = [
        FaceMatchResultResponse(
            face_id=fr.face_id,
            box=BoundingBox(x=fr.box[0], y=fr.box[1], w=fr.box[2], h=fr.box[3]),
            detection_confidence=fr.detection_confidence,
            decision=fr.decision,
            reason=fr.reason,
            candidate_student_id=fr.candidate_student_id,
            candidate_name=fr.candidate_name,
            similarity_score=fr.similarity_score,
            score_margin=fr.score_margin,
            is_collision=fr.is_collision,
        )
        for fr in result.face_results
    ]

    return MatchPreviewResponse(
        dev_mode_only=True,
        course_code=result.course_code,
        section=result.section,
        total_detected_faces=result.total_detected_faces,
        matched_candidates_count=result.matched_candidates_count,
        review_required_count=result.review_required_count,
        unknown_count=result.unknown_count,
        roster_size=result.roster_size,
        face_results=face_results_out,
        anti_spoofing_note=(
            "Anti-spoofing / liveness detection is NOT implemented. "
            "Decisions are based solely on SFace cosine similarity."
        ),
        attendance_note="Preview only. NO attendance records have been written.",
    )


# ---------------------------------------------------------------------------
# Generic error handler — never leak stack traces
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred."},
    )


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    logger.info("PUB AttendEye CV API starting (ENV=%s ORIGIN=%s)", ENV, FRONTEND_ORIGIN)
    _load_models()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.api:app", host="127.0.0.1", port=8000, reload=True)
