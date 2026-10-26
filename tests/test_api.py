"""
PUB AttendEye — FastAPI Bridge Test Suite (Step 7)
====================================================
Tests cover:
  1. Health endpoint — healthy + model-load-error scenarios.
  2. /detect — valid, empty, invalid, oversized, unsupported-content-type images.
  3. /enroll/validate — valid samples, blur rejection, no-face, too many samples.
  4. /match/preview — dev mode success, production-mode block, invalid roster JSON.
  5. Authentication failures — missing token, malformed token, valid dev-bypass.
  6. CORS — correct allow-origin header on valid requests.
  7. Absence of sensitive data — embeddings never appear in responses.
  8. Regression — existing detector + recognizer still pass after API additions.
"""

import io
import json
import os
import sys
import unittest
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import cv2
import numpy as np

# Ensure project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ---------------------------------------------------------------------------
# Import TestClient — skip entire suite if FastAPI/httpx not installed
# ---------------------------------------------------------------------------
try:
    from fastapi.testclient import TestClient
    import backend.api as api_module
    from backend.api import app

    FASTAPI_AVAILABLE = True
except ImportError as _e:
    FASTAPI_AVAILABLE = False
    _IMPORT_ERROR = str(_e)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _blank_jpeg(width: int = 320, height: int = 240) -> bytes:
    """Return a minimal solid-color JPEG image as bytes."""
    img = np.ones((height, width, 3), dtype=np.uint8) * 128
    ok, encoded = cv2.imencode(".jpg", img)
    assert ok, "cv2.imencode failed in test helper"
    return encoded.tobytes()


def _solid_png(width: int = 50, height: int = 50) -> bytes:
    """Return a tiny solid PNG (too small for valid enrollment)."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode(".png", img)
    assert ok, "cv2.imencode PNG failed in test helper"
    return encoded.tobytes()


def _random_unit_embedding() -> list:
    v = np.random.randn(128).astype(np.float32)
    v = v / np.linalg.norm(v)
    return v.tolist()


def _mock_roster_json(n: int = 2) -> str:
    roster = [
        {
            "student_id": f"PUB-CSE-2023-{i:03d}",
            "name": f"Test Student {i}",
            "embedding": _random_unit_embedding(),
        }
        for i in range(1, n + 1)
    ]
    return json.dumps(roster)


# ---------------------------------------------------------------------------
# Fixtures: patch JWT verification for tests that don't test auth boundaries
# ---------------------------------------------------------------------------
_DEV_PAYLOAD: Dict[str, Any] = {"sub": "test-student-001", "role": "authenticated"}


class _AuthBypass:
    """
    Context manager that short-circuits JWT verification for non-auth tests.

    Patches _verify_supabase_jwt to return a fixed payload so that tests
    exercising upload handling, detection quality, etc., don't need a real
    signed token.  Tests for auth boundaries (TestAuthFailures,
    TestJWTVerification) must NOT use this fixture; they patch the module-level
    variables themselves or call _verify_supabase_jwt directly.
    """

    def __enter__(self):
        self._patch = patch.object(
            api_module,
            "_verify_supabase_jwt",
            return_value=_DEV_PAYLOAD,
        )
        self._patch.start()
        return self

    def __exit__(self, *args):
        self._patch.stop()


# Placeholder token value used alongside _AuthBypass (the value itself is not
# verified in auth-bypassed tests because _verify_supabase_jwt is mocked).
AUTH_HEADER = {"Authorization": "Bearer test-placeholder-token"}


# ===========================================================================
# Test classes
# ===========================================================================

@unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI or httpx not installed")
class TestHealthEndpoint(unittest.TestCase):
    """Tests for GET /health."""

    def setUp(self):
        self.auth_bypass = _AuthBypass()
        self.auth_bypass.__enter__()
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        self.auth_bypass.__exit__(None, None, None)

    def test_health_returns_200(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)

    def test_health_has_required_fields(self):
        resp = self.client.get("/health")
        data = resp.json()
        for field in ("status", "env", "model_yunet", "model_sface", "model_version_tag", "timestamp"):
            self.assertIn(field, data, f"Missing field: {field}")

    def test_health_does_not_expose_secrets(self):
        resp = self.client.get("/health")
        body = resp.text
        # Ensure no JWT secret or Supabase keys appear in the response
        self.assertNotIn("SUPABASE_JWT_SECRET", body)
        self.assertNotIn("service_role", body)

    def test_health_model_load_error_reported(self):
        """When models fail to load, /health reports degraded status."""
        with patch.object(api_module, "_detector", None), \
             patch.object(api_module, "_embedder", None), \
             patch.object(api_module, "_model_load_error", "Simulated model failure"), \
             patch.object(api_module, "_enrollment_service", None), \
             patch.object(api_module, "_face_matcher", None):
            # Override _load_models to do nothing (models already "set" to None)
            with patch.object(api_module, "_load_models", return_value=None):
                resp = self.client.get("/health")
                data = resp.json()
                self.assertEqual(data["status"], "degraded")
                self.assertIn("unavailable", data["model_yunet"])
                self.assertIn("unavailable", data["model_sface"])


@unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI or httpx not installed")
class TestDetectEndpoint(unittest.TestCase):
    """Tests for POST /api/v1/faces/detect."""

    def setUp(self):
        self.auth_bypass = _AuthBypass()
        self.auth_bypass.__enter__()
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        self.auth_bypass.__exit__(None, None, None)

    def test_detect_valid_image_returns_200(self):
        jpeg_data = _blank_jpeg(320, 240)
        resp = self.client.post(
            "/api/v1/faces/detect",
            headers=AUTH_HEADER,
            files={"image": ("test.jpg", io.BytesIO(jpeg_data), "image/jpeg")},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("detected_faces", data)
        self.assertIn("face_count", data)
        self.assertIn("image_width", data)
        self.assertIn("image_height", data)
        self.assertIn("processing_time_ms", data)

    def test_detect_no_auth_returns_401(self):
        jpeg_data = _blank_jpeg()
        resp = self.client.post(
            "/api/v1/faces/detect",
            files={"image": ("test.jpg", io.BytesIO(jpeg_data), "image/jpeg")},
        )
        self.assertEqual(resp.status_code, 401)

    def test_detect_oversized_image_returns_413(self):
        # Create a large byte buffer (> 2MB) but still valid JPEG header
        oversized = b"\xff\xd8\xff" + b"X" * (3 * 1024 * 1024)
        resp = self.client.post(
            "/api/v1/faces/detect",
            headers=AUTH_HEADER,
            files={"image": ("big.jpg", io.BytesIO(oversized), "image/jpeg")},
        )
        self.assertEqual(resp.status_code, 413)

    def test_detect_invalid_image_bytes_returns_422(self):
        resp = self.client.post(
            "/api/v1/faces/detect",
            headers=AUTH_HEADER,
            files={"image": ("garbage.jpg", io.BytesIO(b"not-an-image-at-all"), "image/jpeg")},
        )
        self.assertEqual(resp.status_code, 422)

    def test_detect_unsupported_content_type_returns_415(self):
        resp = self.client.post(
            "/api/v1/faces/detect",
            headers=AUTH_HEADER,
            files={"image": ("doc.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        )
        self.assertEqual(resp.status_code, 415)

    def test_detect_response_has_no_embedding_field(self):
        """Ensure detect response never leaks embedding data."""
        jpeg_data = _blank_jpeg()
        resp = self.client.post(
            "/api/v1/faces/detect",
            headers=AUTH_HEADER,
            files={"image": ("test.jpg", io.BytesIO(jpeg_data), "image/jpeg")},
        )
        body = resp.text
        self.assertNotIn("embedding", body)

    def test_detect_blank_image_returns_zero_faces(self):
        """A solid blank image should produce zero face detections."""
        blank = np.zeros((480, 640, 3), dtype=np.uint8)
        _, enc = cv2.imencode(".jpg", blank)
        resp = self.client.post(
            "/api/v1/faces/detect",
            headers=AUTH_HEADER,
            files={"image": ("blank.jpg", io.BytesIO(enc.tobytes()), "image/jpeg")},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["face_count"], 0)
        self.assertEqual(data["detected_faces"], [])


@unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI or httpx not installed")
class TestEnrollValidateEndpoint(unittest.TestCase):
    """Tests for POST /api/v1/faces/enroll/validate."""

    def setUp(self):
        self.auth_bypass = _AuthBypass()
        self.auth_bypass.__enter__()
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        self.auth_bypass.__exit__(None, None, None)

    def _post_samples(self, images: list, auth: bool = True) -> "requests.Response":
        files = [
            ("samples", (f"sample_{i+1}.jpg", io.BytesIO(img), "image/jpeg"))
            for i, img in enumerate(images)
        ]
        headers = AUTH_HEADER if auth else {}
        return self.client.post(
            "/api/v1/faces/enroll/validate",
            headers=headers,
            files=files,
        )

    def test_enroll_validate_no_auth_returns_401(self):
        resp = self._post_samples([_blank_jpeg()], auth=False)
        self.assertEqual(resp.status_code, 401)

    def test_enroll_validate_valid_image_returns_200(self):
        resp = self._post_samples([_blank_jpeg(640, 480)])
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("all_valid", data)
        self.assertIn("samples", data)
        self.assertIn("model_version", data)
        self.assertIn("anti_spoofing_note", data)

    def test_enroll_validate_anti_spoofing_disclaimer_present(self):
        """Anti-spoofing disclaimer must always be in the response."""
        resp = self._post_samples([_blank_jpeg(640, 480)])
        data = resp.json()
        self.assertIn("NOT implemented", data["anti_spoofing_note"])

    def test_enroll_validate_embedding_never_in_response(self):
        """128D embedding must never be returned to the client."""
        resp = self._post_samples([_blank_jpeg(640, 480)])
        body = resp.text
        self.assertNotIn("embedding_vector", body)
        # Ensure we don't see a 128-element array pattern either
        self.assertNotIn('"embedding"', body)

    def test_enroll_validate_too_many_samples_returns_422(self):
        samples = [_blank_jpeg() for _ in range(6)]  # 6 > MAX_ENROLL_SAMPLES (5)
        resp = self._post_samples(samples)
        self.assertEqual(resp.status_code, 422)

    def test_enroll_validate_tiny_image_fails_quality(self):
        """Images too small should fail quality check, not crash."""
        tiny = _solid_png(50, 50)
        resp = self._post_samples([tiny])
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # Should succeed at the HTTP level but report invalid sample
        self.assertEqual(data["all_valid"], False)
        self.assertEqual(data["valid_sample_count"], 0)
        self.assertIsNotNone(data["samples"][0]["rejection_reason"])

    def test_enroll_validate_invalid_bytes_returns_rejected_sample(self):
        """
        The enrollment endpoint returns HTTP 200 with is_valid=False per sample
        when the image cannot be decoded — this is the correct API contract.
        Per-sample quality results are always in the response body, not as error status codes,
        so callers can get feedback on all samples in one request.
        """
        not_an_image = b"\x00" * 10  # Definitely not a valid JPEG/PNG/WebP
        resp = self.client.post(
            "/api/v1/faces/enroll/validate",
            headers=AUTH_HEADER,
            files=[("samples", ("bad.jpg", io.BytesIO(not_an_image), "image/jpeg"))],
        )
        # HTTP 200 — the endpoint processed the request; per-sample result is invalid
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["all_valid"], False)
        self.assertEqual(data["valid_sample_count"], 0)
        self.assertIsNotNone(data["samples"][0]["rejection_reason"])
        # The rejection reason should mention decoding failure
        self.assertIn("decoded", data["samples"][0]["rejection_reason"].lower())

    def test_enroll_validate_sample_results_count_matches(self):
        images = [_blank_jpeg(320, 240), _blank_jpeg(320, 240)]
        resp = self._post_samples(images)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total_sample_count"], 2)
        self.assertEqual(len(data["samples"]), 2)


@unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI or httpx not installed")
class TestMatchPreviewEndpoint(unittest.TestCase):
    """Tests for POST /api/v1/faces/match/preview."""

    def setUp(self):
        self.auth_bypass = _AuthBypass()
        self.auth_bypass.__enter__()
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        self.auth_bypass.__exit__(None, None, None)

    def _post_preview(self, roster_json: str = None, auth: bool = True) -> "requests.Response":
        jpeg_data = _blank_jpeg(640, 480)
        if roster_json is None:
            roster_json = _mock_roster_json(2)
        headers = AUTH_HEADER if auth else {}
        return self.client.post(
            "/api/v1/faces/match/preview",
            headers=headers,
            files={
                "image": ("classroom.jpg", io.BytesIO(jpeg_data), "image/jpeg"),
                "course_code": (None, "CSE 2205"),
                "section": (None, "Section A"),
                "mock_roster_json": (None, roster_json),
            },
        )

    def test_match_preview_no_auth_returns_401(self):
        resp = self._post_preview(auth=False)
        self.assertEqual(resp.status_code, 401)

    def test_match_preview_dev_mode_returns_200(self):
        resp = self._post_preview()
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["dev_mode_only"])
        self.assertIn("face_results", data)
        self.assertIn("anti_spoofing_note", data)
        self.assertIn("attendance_note", data)

    def test_match_preview_blocked_in_production(self):
        """
        When IS_PRODUCTION is True, the match/preview endpoint must return 403.
        We must also patch _verify_supabase_jwt so auth succeeds, otherwise the
        SUPABASE_JWT_SECRET-not-set 500 fires before the production check.
        """
        original_prod = api_module.IS_PRODUCTION
        dev_payload = {"sub": "test-teacher", "role": "authenticated"}
        try:
            api_module.IS_PRODUCTION = True
            # Patch JWT verify to always succeed so auth passes
            with patch.object(api_module, "_verify_supabase_jwt", return_value=dev_payload):
                client = TestClient(app, raise_server_exceptions=False)
                jpeg_data = _blank_jpeg(640, 480)
                roster_json = _mock_roster_json(2)
                resp = client.post(
                    "/api/v1/faces/match/preview",
                    headers=AUTH_HEADER,
                    files={
                        "image": ("classroom.jpg", io.BytesIO(jpeg_data), "image/jpeg"),
                        "course_code": (None, "CSE 2205"),
                        "section": (None, "Section A"),
                        "mock_roster_json": (None, roster_json),
                    },
                )
                self.assertEqual(resp.status_code, 403)
        finally:
            api_module.IS_PRODUCTION = original_prod

    def test_match_preview_invalid_roster_json_returns_422(self):
        resp = self._post_preview(roster_json="this is not json")
        self.assertEqual(resp.status_code, 422)

    def test_match_preview_no_embeddings_in_response(self):
        """Raw embeddings must never appear in match preview response."""
        resp = self._post_preview()
        body = resp.text
        self.assertNotIn("embedding_vector", body)

    def test_match_preview_attendance_note_present(self):
        resp = self._post_preview()
        data = resp.json()
        self.assertIn("NO attendance records", data["attendance_note"])

    def test_match_preview_anti_spoofing_note_present(self):
        resp = self._post_preview()
        data = resp.json()
        self.assertIn("NOT implemented", data["anti_spoofing_note"])

    def test_match_preview_blank_image_returns_zero_matches(self):
        resp = self._post_preview()
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # A blank image has no detectable faces → zero matches
        self.assertEqual(data["total_detected_faces"], 0)
        self.assertEqual(data["matched_candidates_count"], 0)


@unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI or httpx not installed")
class TestEnrollExtractTemplateEndpoint(unittest.TestCase):
    """Tests for POST /api/v1/faces/enroll/extract_template."""

    def setUp(self):
        self.auth_bypass = _AuthBypass()
        self.auth_bypass.__enter__()
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        self.auth_bypass.__exit__(None, None, None)

    def test_extract_template_empty_samples_returns_422(self):
        resp = self.client.post(
            "/api/v1/faces/enroll/extract_template",
            headers={"Authorization": "Bearer dev-test-token"},
            files=[],
        )
        self.assertIn(resp.status_code, (400, 422))

    def test_extract_template_auth_failure_without_bypass(self):
        self.auth_bypass.__exit__(None, None, None)
        try:
            resp = self.client.post(
                "/api/v1/faces/enroll/extract_template",
                files=[("samples", ("sample.jpg", io.BytesIO(_blank_jpeg()), "image/jpeg"))],
            )
            self.assertEqual(resp.status_code, 401)
        finally:
            self.auth_bypass.__enter__()


@unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI or httpx not installed")
class TestFaceMatchEndpoint(unittest.TestCase):
    """Tests for POST /api/v1/faces/match."""

    def setUp(self):
        self.auth_bypass = _AuthBypass()
        self.auth_bypass.__enter__()
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        self.auth_bypass.__exit__(None, None, None)

    def test_match_blank_image_returns_zero_detections(self):
        jpeg_data = _blank_jpeg(640, 480)
        roster_json = _mock_roster_json(2)
        resp = self.client.post(
            "/api/v1/faces/match",
            headers={"Authorization": "Bearer dev-test-token"},
            files={
                "image": ("classroom.jpg", io.BytesIO(jpeg_data), "image/jpeg"),
                "course_code": (None, "CSE 2205"),
                "section": (None, "Section A"),
                "roster_json": (None, roster_json),
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total_detected_faces"], 0)
        self.assertEqual(data["matched_candidates_count"], 0)
        self.assertEqual(data["review_required_count"], 0)
        self.assertEqual(data["unknown_count"], 0)
        self.assertEqual(data["face_results"], [])

    def test_match_auth_failure_without_bypass(self):
        self.auth_bypass.__exit__(None, None, None)
        try:
            resp = self.client.post(
                "/api/v1/faces/match",
                files={
                    "image": ("classroom.jpg", io.BytesIO(_blank_jpeg()), "image/jpeg"),
                    "course_code": (None, "CSE 2205"),
                    "section": (None, "Section A"),
                    "roster_json": (None, "[]"),
                },
            )
            self.assertEqual(resp.status_code, 401)
        finally:
            self.auth_bypass.__enter__()

    def test_match_invalid_roster_json_returns_422(self):
        resp = self.client.post(
            "/api/v1/faces/match",
            headers={"Authorization": "Bearer dev-test-token"},
            files={
                "image": ("classroom.jpg", io.BytesIO(_blank_jpeg()), "image/jpeg"),
                "course_code": (None, "CSE 2205"),
                "section": (None, "Section A"),
                "roster_json": (None, "not valid json"),
            },
        )
        self.assertEqual(resp.status_code, 422)


@unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI or httpx not installed")
class TestCORSConfiguration(unittest.TestCase):
    """Tests for CORS headers."""

    def setUp(self):
        self.auth_bypass = _AuthBypass()
        self.auth_bypass.__enter__()

    def tearDown(self):
        self.auth_bypass.__exit__(None, None, None)

    def test_cors_allows_configured_origin(self):
        frontend = "http://localhost:3000"
        with patch.object(api_module, "FRONTEND_ORIGIN", frontend):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.options(
                "/health",
                headers={
                    "Origin": frontend,
                    "Access-Control-Request-Method": "GET",
                },
            )
            allow_origin = resp.headers.get("access-control-allow-origin", "")
            self.assertEqual(allow_origin, frontend)

    def test_cors_wildcard_not_used(self):
        """CORS must never set allow-origin to '*' when credentials are included."""
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/health", headers={"Origin": "http://localhost:3000"})
        allow_origin = resp.headers.get("access-control-allow-origin", "")
        self.assertNotEqual(allow_origin, "*")


@unittest.skipUnless(FASTAPI_AVAILABLE, "FastAPI or httpx not installed")
class TestAuthFailures(unittest.TestCase):
    """Tests for authentication boundary enforcement."""

    def setUp(self):
        # Use production-like auth enforcement (JWT secret set to a test value)
        self._jwt_patch = patch.object(api_module, "SUPABASE_JWT_SECRET", "test-secret-value")
        self._jwt_patch.start()
        self._prod_patch = patch.object(api_module, "IS_PRODUCTION", False)
        self._prod_patch.start()
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        self._jwt_patch.stop()
        self._prod_patch.stop()

    def test_missing_auth_header_returns_401(self):
        jpeg_data = _blank_jpeg()
        resp = self.client.post(
            "/api/v1/faces/detect",
            files={"image": ("t.jpg", io.BytesIO(jpeg_data), "image/jpeg")},
        )
        self.assertEqual(resp.status_code, 401)

    def test_malformed_token_returns_401(self):
        resp = self.client.post(
            "/api/v1/faces/detect",
            headers={"Authorization": "Bearer not.a.real.jwt"},
            files={"image": ("t.jpg", io.BytesIO(_blank_jpeg()), "image/jpeg")},
        )
        self.assertEqual(resp.status_code, 401)

    def test_401_response_does_not_leak_secrets(self):
        resp = self.client.post(
            "/api/v1/faces/detect",
            headers={"Authorization": "Bearer bad-token"},
            files={"image": ("t.jpg", io.BytesIO(_blank_jpeg()), "image/jpeg")},
        )
        body = resp.text
        self.assertNotIn("test-secret-value", body)
        self.assertNotIn("SUPABASE_JWT_SECRET", body)


# ---------------------------------------------------------------------------
# Regression: existing detector + recognizer tests must still pass
# ---------------------------------------------------------------------------
class TestDetectorRegressionStep7(unittest.TestCase):
    """Smoke regression test to confirm existing detector still works after Step 7."""

    @classmethod
    def setUpClass(cls):
        from backend.detector import YuNetFaceDetector
        cls.detector = YuNetFaceDetector(conf_threshold=0.60)

    def test_detector_blank_frame_returns_empty(self):
        blank = np.zeros((480, 640, 3), dtype=np.uint8)
        faces = self.detector.detect(blank)
        self.assertEqual(faces, [])

    def test_detector_none_returns_empty(self):
        faces = self.detector.detect(None)
        self.assertEqual(faces, [])


class TestRecognizerRegressionStep7(unittest.TestCase):
    """Smoke regression test for SFace embedder after Step 7."""

    @classmethod
    def setUpClass(cls):
        from backend.recognizer import SFaceEmbedder
        cls.embedder = SFaceEmbedder()

    def test_embedder_model_name(self):
        self.assertEqual(self.embedder.MODEL_NAME, "v1.0-sface")

    def test_embedder_dimension(self):
        self.assertEqual(self.embedder.EMBEDDING_DIM, 128)


if __name__ == "__main__":
    print("=" * 70)
    print("PUB AttendEye — Step 7 FastAPI Bridge Tests")
    print("=" * 70)
    if not FASTAPI_AVAILABLE:
        print(f"WARNING: FastAPI not available ({_IMPORT_ERROR}). API tests skipped.")
        print("Run: pip install fastapi httpx uvicorn python-multipart")
    unittest.main(verbosity=2)
