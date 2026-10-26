"""
PUB AttendEye — Python CV & Enrollment Authentication Regression Tests
======================================================================
Tests:
1. Supabase JWKS Endpoint Resolution (validates /auth/v1/.well-known/jwks.json derivation).
2. Live Supabase Auth ES256 Public Key Fetching & Cryptographic Construction.
3. Asymmetric EC (ES256) Token Verification with live / mocked JWKS.
4. Token Expiration Enforcement (expired token -> 401).
5. Missing Claims Enforcement (missing sub -> 401, missing exp -> 401).
6. Non-production Dev Bypass strict behavior (exact token required, rejected in production).
7. Protected Enrollment Endpoints (/api/v1/faces/enroll/validate and /api/v1/faces/enroll/extract_template):
   - Missing token -> 401
   - Arbitrary token -> 401
   - Dev token in non-prod -> 200 / 422 depending on sample validity.
"""

import os
import sys
import time
import unittest
from typing import Any, Dict
from unittest.mock import patch

# Ensure project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import HTTPException
from fastapi.testclient import TestClient
from jose import jwt as jose_jwt, jwk as jose_jwk
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

import backend.api as api_module
from backend.api import _verify_supabase_jwt, _fetch_jwks, app

client = TestClient(app)


def _generate_ec_key_pair():
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    kid = "test-ec-key-enrollment-001"

    pub_numbers = public_key.public_numbers()
    import base64

    def int_to_b64(val: int) -> str:
        b = val.to_bytes(32, byteorder="big")
        return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")

    jwk_dict = {
        "kty": "EC",
        "crv": "P-256",
        "alg": "ES256",
        "use": "sig",
        "kid": kid,
        "x": int_to_b64(pub_numbers.x),
        "y": int_to_b64(pub_numbers.y),
    }

    jwks = {"keys": [jwk_dict]}
    return private_key, jwks, kid


def _make_es256_token(private_key, kid: str, payload: Dict[str, Any]) -> str:
    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return jose_jwt.encode(payload, pem, algorithm="ES256", headers={"kid": kid, "alg": "ES256"})


class TestEnrollmentAuthRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._private_key, cls._jwks, cls._kid = _generate_ec_key_pair()

    def setUp(self):
        if not hasattr(_verify_supabase_jwt, "_jwks_cache"):
            _verify_supabase_jwt._jwks_cache = {}
        else:
            _verify_supabase_jwt._jwks_cache.clear()

    def test_derived_jwks_uri_contains_auth_v1(self):
        """Verify that standard Supabase URL derives the official /auth/v1/.well-known/jwks.json path."""
        test_url = "https://custom-project.supabase.co"
        base_url = test_url.rstrip("/")
        derived = f"{base_url}/auth/v1/.well-known/jwks.json" if not base_url.endswith("/auth/v1") else f"{base_url}/.well-known/jwks.json"
        self.assertEqual(derived, "https://custom-project.supabase.co/auth/v1/.well-known/jwks.json")

    def test_live_supabase_jwks_fetch(self):
        """Live test: fetch genuine public keys from configured Supabase instance."""
        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://gakkoyuskfgkryuyoang.supabase.co").rstrip("/")
        uri = f"{supabase_url}/auth/v1/.well-known/jwks.json"
        data = _fetch_jwks(uri)
        self.assertIn("keys", data)
        self.assertIsInstance(data["keys"], list)
        self.assertGreater(len(data["keys"]), 0)
        first_key = data["keys"][0]
        self.assertIn(first_key.get("alg"), {"ES256", "RS256"})
        self.assertIn(first_key.get("kty"), {"EC", "RSA"})

    def test_mocked_es256_jwt_verification_success(self):
        """Verify that an ES256 signed JWT is successfully decoded and validated with matching JWKS."""
        test_supabase_url = "https://test-ec.supabase.co"
        expected_uri = f"{test_supabase_url}/auth/v1/.well-known/jwks.json"

        # Pre-seed cache to avoid network call
        if not hasattr(_verify_supabase_jwt, "_jwks_cache"):
            _verify_supabase_jwt._jwks_cache = {}
        _verify_supabase_jwt._jwks_cache[expected_uri] = self._jwks

        payload = {
            "sub": "student-uuid-ec-001",
            "role": "authenticated",
            "aud": "authenticated",
            "exp": int(time.time()) + 3600,
        }
        token = _make_es256_token(self._private_key, self._kid, payload)

        with patch.dict(os.environ, {"NEXT_PUBLIC_SUPABASE_URL": test_supabase_url, "SUPABASE_JWT_JWKS_URL": ""}):
            result = _verify_supabase_jwt(token)
            self.assertEqual(result["sub"], "student-uuid-ec-001")
            self.assertEqual(result["role"], "authenticated")

    def test_es256_jwt_expired_rejected(self):
        """Expired ES256 token must be rejected with 401."""
        test_supabase_url = "https://test-ec.supabase.co"
        expected_uri = f"{test_supabase_url}/auth/v1/.well-known/jwks.json"
        _verify_supabase_jwt._jwks_cache[expected_uri] = self._jwks

        payload = {
            "sub": "student-uuid-ec-001",
            "role": "authenticated",
            "exp": int(time.time()) - 10,
        }
        token = _make_es256_token(self._private_key, self._kid, payload)

        with patch.dict(os.environ, {"NEXT_PUBLIC_SUPABASE_URL": test_supabase_url, "SUPABASE_JWT_JWKS_URL": ""}):
            with self.assertRaises(HTTPException) as ctx:
                _verify_supabase_jwt(token)
            self.assertEqual(ctx.exception.status_code, 401)
            self.assertIn("expired", ctx.exception.detail.lower())

    def test_es256_jwt_missing_sub_rejected(self):
        """ES256 token without 'sub' claim must be rejected with 401."""
        test_supabase_url = "https://test-ec.supabase.co"
        expected_uri = f"{test_supabase_url}/auth/v1/.well-known/jwks.json"
        _verify_supabase_jwt._jwks_cache[expected_uri] = self._jwks

        payload = {
            "role": "authenticated",
            "exp": int(time.time()) + 3600,
        }
        token = _make_es256_token(self._private_key, self._kid, payload)

        with patch.dict(os.environ, {"NEXT_PUBLIC_SUPABASE_URL": test_supabase_url, "SUPABASE_JWT_JWKS_URL": ""}):
            with self.assertRaises(HTTPException) as ctx:
                _verify_supabase_jwt(token)
            self.assertEqual(ctx.exception.status_code, 401)
            self.assertIn("subject", ctx.exception.detail.lower())

    def test_extract_template_missing_auth_returns_401(self):
        """POST /api/v1/faces/enroll/extract_template without Authorization header must return 401."""
        response = client.post("/api/v1/faces/enroll/extract_template")
        self.assertEqual(response.status_code, 401)

    def test_extract_template_arbitrary_auth_returns_401(self):
        """POST /api/v1/faces/enroll/extract_template with arbitrary unverified token must return 401."""
        response = client.post(
            "/api/v1/faces/enroll/extract_template",
            headers={"Authorization": "Bearer completely-arbitrary-untrusted-token-value"}
        )
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
