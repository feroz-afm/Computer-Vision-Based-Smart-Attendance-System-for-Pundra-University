"""
PUB AttendEye — JWT Verification Regression Tests (Step 7C)
============================================================

Tests cover:
  1.  Path A (HS256) — valid token accepted.
  2.  Path A (HS256) — expired token rejected (401).
  3.  Path A (HS256) — missing 'sub' claim rejected (401).
  4.  Path A (HS256) — wrong signing secret rejected (401).
  5.  Path A (HS256) — token with non-HS256 'alg' header rejected (401).
  6.  Path A (HS256) — completely malformed token rejected (401).
  7.  Path B (JWKS)  — valid RS256 token accepted (mocked JWKS endpoint).
  8.  Path B (JWKS)  — unknown 'kid' rejected (401).
  9.  Path B (JWKS)  — JWKS fetch failure → 401 (no fallback to bypass).
  10. Path B (JWKS)  — unsupported algorithm (e.g. none/HS256) in token header → 401.
  11. Path B (JWKS)  — key-type/algorithm mismatch (EC key presented for RS256) → 401.
  12. Path B (JWKS)  — expired token rejected (401).
  13. Path B (JWKS)  — missing 'sub' claim rejected (401).
  14. Path C (Dev bypass) — exact token match in non-production → accepted.
  15. Path C (Dev bypass) — wrong token in non-production → 401.
  16. Path C (Dev bypass) — bypass disabled when IS_PRODUCTION=True → 500.
  17. Path C (Dev bypass) — bypass disabled when DEV_TEST_TOKEN unset → 401.
  18. Security: no signing method switching between HS256 and JWKS paths.
  19. require_auth dependency — missing credential → 401.
  20. require_auth dependency — valid HS256 token → 200 on /health (auth-free endpoint).

IMPORTANT: This test file NEVER reads .env.local or any real secret.
All keys used here are generated fresh in setUpClass / setUp.
"""

import os
import sys
import time
import unittest
from datetime import datetime, timezone
from typing import Any, Dict
from unittest.mock import MagicMock, patch

# ---------------------------------------------------------------------------
# Conditional imports — skip whole suite when crypto libs missing
# ---------------------------------------------------------------------------
try:
    from jose import jwt as jose_jwt, jwk as jose_jwk
    from cryptography.hazmat.primitives.asymmetric import rsa, ec
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import serialization
    CRYPTO_AVAILABLE = True
except ImportError as _e:
    CRYPTO_AVAILABLE = False
    _CRYPTO_ERROR = str(_e)

try:
    from fastapi import HTTPException
    from fastapi.testclient import TestClient
    import backend.api as api_module
    from backend.api import _verify_supabase_jwt, require_auth, app
    FASTAPI_AVAILABLE = True
except ImportError as _fe:
    FASTAPI_AVAILABLE = False
    _FASTAPI_ERROR = str(_fe)

# Ensure project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ---------------------------------------------------------------------------
# Test secret — never a real Supabase secret; only used in tests.
# ---------------------------------------------------------------------------
_TEST_HS256_SECRET = "test-only-hs256-secret-never-used-in-production-xYz9!"
_TEST_DEV_TOKEN = "dev-bypass-test-token-abc123XYZ-never-real"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_hs256_token(
    payload: Dict[str, Any],
    secret: str = _TEST_HS256_SECRET,
    headers: Dict[str, Any] | None = None,
) -> str:
    """Sign a JWT with HS256 using a test secret."""
    return jose_jwt.encode(payload, secret, algorithm="HS256", headers=headers)


def _future_exp() -> int:
    """Return an expiry timestamp 1 hour in the future."""
    return int(time.time()) + 3600


def _past_exp() -> int:
    """Return an expiry timestamp 1 second in the past."""
    return int(time.time()) - 1


def _valid_hs256_payload(**extra) -> Dict[str, Any]:
    base = {
        "sub": "student-uuid-0001",
        "role": "authenticated",
        "exp": _future_exp(),
        "iat": int(time.time()),
    }
    base.update(extra)
    return base


# ---------------------------------------------------------------------------
# RSA key pair generator (used once per TestJWTVerificationJWKS class)
# ---------------------------------------------------------------------------

def _generate_rsa_jwks() -> tuple:
    """
    Return (rsa_private_key, jwks_dict, kid) for RS256 JWKS testing.
    Keys are generated fresh each invocation and are not persisted.
    """
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend(),
    )
    public_key = private_key.public_key()
    kid = "test-rsa-key-001"

    # Export public key as JWK-compatible dict using python-jose.
    public_pem = public_key.public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    # Build a minimal JWKS structure that jose can parse.
    # jose can construct from PEM; we wrap it in a JWKS envelope.
    jwks = {
        "keys": [
            {
                "kty": "RSA",
                "kid": kid,
                "alg": "RS256",
                "use": "sig",
                **jose_jwk.construct(public_pem, algorithm="RS256").to_dict(),
            }
        ]
    }
    return private_key, jwks, kid


def _make_rs256_token(private_key, kid: str, payload: Dict[str, Any]) -> str:
    """Sign a JWT with RS256 using the given private key."""
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    return jose_jwt.encode(
        payload,
        private_pem,
        algorithm="RS256",
        headers={"kid": kid},
    )


# ===========================================================================
# Test class — Path A: HS256
# ===========================================================================

@unittest.skipUnless(CRYPTO_AVAILABLE and FASTAPI_AVAILABLE, "Crypto or FastAPI unavailable")
class TestJWTVerificationHS256(unittest.TestCase):
    """Tests for Path A: HS256 verification using a shared secret."""

    def setUp(self):
        # Activate the HS256 path by setting a test secret.
        # NEXT_PUBLIC_SUPABASE_URL is cleared so the JWKS path is not tried.
        self._patches = [
            patch.object(api_module, "SUPABASE_JWT_SECRET", _TEST_HS256_SECRET),
            patch.object(api_module, "IS_PRODUCTION", False),
            patch.dict(os.environ, {"NEXT_PUBLIC_SUPABASE_URL": ""}, clear=False),
        ]
        for p in self._patches:
            p.start()
        # Clear any cached JWKS from other tests.
        if hasattr(_verify_supabase_jwt, "_jwks_cache"):
            _verify_supabase_jwt._jwks_cache.clear()

    def tearDown(self):
        for p in reversed(self._patches):
            p.stop()

    # ------------------------------------------------------------------
    # 1. Valid HS256 token is accepted
    # ------------------------------------------------------------------
    def test_valid_hs256_token_accepted(self):
        token = _make_hs256_token(_valid_hs256_payload())
        payload = _verify_supabase_jwt(token)
        self.assertEqual(payload["sub"], "student-uuid-0001")
        self.assertEqual(payload["role"], "authenticated")

    # ------------------------------------------------------------------
    # 2. Expired token rejected with 401
    # ------------------------------------------------------------------
    def test_expired_hs256_token_rejected(self):
        token = _make_hs256_token(_valid_hs256_payload(exp=_past_exp()))
        with self.assertRaises(HTTPException) as ctx:
            _verify_supabase_jwt(token)
        self.assertEqual(ctx.exception.status_code, 401)

    # ------------------------------------------------------------------
    # 3. Missing 'sub' claim rejected with 401
    # ------------------------------------------------------------------
    def test_missing_sub_claim_rejected(self):
        payload = {"role": "authenticated", "exp": _future_exp()}
        token = _make_hs256_token(payload)
        with self.assertRaises(HTTPException) as ctx:
            _verify_supabase_jwt(token)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("subject", ctx.exception.detail.lower())

    # ------------------------------------------------------------------
    # 3b. Missing 'exp' claim rejected with 401
    # ------------------------------------------------------------------
    def test_missing_exp_claim_rejected(self):
        payload = {"sub": "student-uuid-0001", "role": "authenticated"}
        token = _make_hs256_token(payload)
        with self.assertRaises(HTTPException) as ctx:
            _verify_supabase_jwt(token)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("exp", ctx.exception.detail.lower())

    # ------------------------------------------------------------------
    # 3c. Future 'nbf' claim rejected with 401
    # ------------------------------------------------------------------
    def test_future_nbf_claim_rejected(self):
        token = _make_hs256_token(_valid_hs256_payload(nbf=int(time.time()) + 300))
        with self.assertRaises(HTTPException) as ctx:
            _verify_supabase_jwt(token)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("nbf", ctx.exception.detail.lower())

    # ------------------------------------------------------------------
    # 3d. Wrong issuer rejected with 401
    # ------------------------------------------------------------------
    def test_wrong_issuer_rejected(self):
        with patch.dict(os.environ, {"SUPABASE_JWT_ISSUER": "https://expected.supabase.co/auth/v1"}):
            token = _make_hs256_token(_valid_hs256_payload(iss="https://wrong-issuer.supabase.co/auth/v1"))
            with self.assertRaises(HTTPException) as ctx:
                _verify_supabase_jwt(token)
            self.assertEqual(ctx.exception.status_code, 401)
            self.assertIn("issuer mismatch", ctx.exception.detail.lower())

    # ------------------------------------------------------------------
    # 3e. Matching issuer accepted with 200
    # ------------------------------------------------------------------
    def test_matching_issuer_accepted(self):
        with patch.dict(os.environ, {"SUPABASE_JWT_ISSUER": "https://expected.supabase.co/auth/v1"}):
            token = _make_hs256_token(_valid_hs256_payload(iss="https://expected.supabase.co/auth/v1"))
            payload = _verify_supabase_jwt(token)
            self.assertEqual(payload["iss"], "https://expected.supabase.co/auth/v1")

    # ------------------------------------------------------------------
    # 3f. Wrong audience rejected with 401
    # ------------------------------------------------------------------
    def test_wrong_audience_rejected(self):
        with patch.dict(os.environ, {"SUPABASE_JWT_AUDIENCE": "authenticated"}):
            token = _make_hs256_token(_valid_hs256_payload(aud="anon"))
            with self.assertRaises(HTTPException) as ctx:
                _verify_supabase_jwt(token)
            self.assertEqual(ctx.exception.status_code, 401)
            self.assertIn("audience mismatch", ctx.exception.detail.lower())

    # ------------------------------------------------------------------
    # 3g. Matching audience accepted with 200
    # ------------------------------------------------------------------
    def test_matching_audience_accepted(self):
        with patch.dict(os.environ, {"SUPABASE_JWT_AUDIENCE": "authenticated"}):
            token = _make_hs256_token(_valid_hs256_payload(aud="authenticated"))
            payload = _verify_supabase_jwt(token)
            self.assertEqual(payload["aud"], "authenticated")

    # ------------------------------------------------------------------
    # 4. Wrong HS256 secret rejected with 401
    # ------------------------------------------------------------------
    def test_wrong_hs256_secret_rejected(self):
        token = _make_hs256_token(_valid_hs256_payload(), secret="wrong-secret-xyz")
        with self.assertRaises(HTTPException) as ctx:
            _verify_supabase_jwt(token)
        self.assertEqual(ctx.exception.status_code, 401)

    # ------------------------------------------------------------------
    # 5. Token header claims non-HS256 algorithm (RS256) → rejected 401
    #    (prevents algorithm-confusion attacks)
    # ------------------------------------------------------------------
    def test_non_hs256_alg_header_rejected_in_hs256_path(self):
        # Craft a token whose header says RS256 but we try to use it against
        # an HS256-configured server.
        # jose encodes with the given algorithm; _verify_supabase_jwt must reject
        # it before attempting verification because the alg header ≠ HS256.
        private_key, _, kid = _generate_rsa_jwks()
        private_pem = private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
        token = jose_jwt.encode(
            _valid_hs256_payload(),
            private_pem,
            algorithm="RS256",
            headers={"kid": kid},
        )
        with self.assertRaises(HTTPException) as ctx:
            _verify_supabase_jwt(token)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("unsupported signing algorithm", ctx.exception.detail.lower())

    # ------------------------------------------------------------------
    # 6. Completely malformed token rejected with 401
    # ------------------------------------------------------------------
    def test_malformed_token_rejected(self):
        for bad in ("", "not.a.jwt", "Bearer xyz", "eyJh.eyJz.", "aaa"):
            with self.subTest(token=bad):
                with self.assertRaises(HTTPException) as ctx:
                    _verify_supabase_jwt(bad)
                self.assertEqual(ctx.exception.status_code, 401)

    # ------------------------------------------------------------------
    # 18. When HS256 secret is set, JWKS path must NOT be consulted
    # ------------------------------------------------------------------
    def test_hs256_path_does_not_fall_through_to_jwks(self):
        """If the secret is set, httpx must never be called for JWKS."""
        import httpx
        with patch.object(httpx, "get", side_effect=AssertionError("Should not fetch JWKS")):
            # Valid HS256 token must succeed without touching httpx.
            token = _make_hs256_token(_valid_hs256_payload())
            payload = _verify_supabase_jwt(token)
            self.assertIn("sub", payload)


# ===========================================================================
# Test class — Path B: JWKS (RS256)
# ===========================================================================

@unittest.skipUnless(CRYPTO_AVAILABLE and FASTAPI_AVAILABLE, "Crypto or FastAPI unavailable")
class TestJWTVerificationJWKS(unittest.TestCase):
    """Tests for Path B: JWKS-based RS256 verification."""

    @classmethod
    def setUpClass(cls):
        cls._private_key, cls._jwks, cls._kid = _generate_rsa_jwks()

    def setUp(self):
        # Deactivate HS256 path; activate JWKS path.
        self._patches = [
            patch.object(api_module, "SUPABASE_JWT_SECRET", ""),
            patch.object(api_module, "IS_PRODUCTION", False),
            patch.dict(
                os.environ,
                {"NEXT_PUBLIC_SUPABASE_URL": "https://test-project.supabase.co"},
                clear=False,
            ),
        ]
        for p in self._patches:
            p.start()
        # Inject pre-fetched JWKS into the in-process cache so httpx isn't needed.
        jwks_uri = "https://test-project.supabase.co/.well-known/jwks.json"
        if not hasattr(_verify_supabase_jwt, "_jwks_cache"):
            _verify_supabase_jwt._jwks_cache = {}
        _verify_supabase_jwt._jwks_cache[jwks_uri] = self.__class__._jwks

    def tearDown(self):
        for p in reversed(self._patches):
            p.stop()
        if hasattr(_verify_supabase_jwt, "_jwks_cache"):
            _verify_supabase_jwt._jwks_cache.clear()

    def _make_token(self, payload: Dict[str, Any] | None = None) -> str:
        if payload is None:
            payload = _valid_hs256_payload()
        return _make_rs256_token(self.__class__._private_key, self.__class__._kid, payload)

    # ------------------------------------------------------------------
    # 7. Valid RS256 token accepted
    # ------------------------------------------------------------------
    def test_valid_rs256_token_accepted(self):
        token = self._make_token()
        payload = _verify_supabase_jwt(token)
        self.assertEqual(payload["sub"], "student-uuid-0001")

    # ------------------------------------------------------------------
    # 8. Unknown 'kid' rejected with 401
    # ------------------------------------------------------------------
    def test_unknown_kid_rejected(self):
        private_key = self.__class__._private_key
        private_pem = private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
        token = jose_jwt.encode(
            _valid_hs256_payload(),
            private_pem,
            algorithm="RS256",
            headers={"kid": "unknown-kid-xyz"},
        )
        with self.assertRaises(HTTPException) as ctx:
            _verify_supabase_jwt(token)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("unknown key", ctx.exception.detail.lower())

    # ------------------------------------------------------------------
    # 9. JWKS fetch failure → 401 (no silent fallback to dev bypass)
    # ------------------------------------------------------------------
    def test_jwks_fetch_failure_returns_401_not_bypass(self):
        # Clear cache and make httpx.get raise an error.
        _verify_supabase_jwt._jwks_cache.clear()
        import httpx
        with patch.object(httpx, "get", side_effect=Exception("network error")):
            with self.assertRaises(HTTPException) as ctx:
                _verify_supabase_jwt(self._make_token())
            self.assertEqual(ctx.exception.status_code, 401)
            # Must NOT return a dev bypass payload
            self.assertIn("signing keys", ctx.exception.detail.lower())

    # ------------------------------------------------------------------
    # 10. Unsupported algorithm in token header → 401
    # ------------------------------------------------------------------
    def test_unsupported_algorithm_header_rejected(self):
        # Craft an HS256 token while the JWKS path is active; alg=HS256 is
        # not in the asymmetric allowlist so it must be rejected.
        token = _make_hs256_token(_valid_hs256_payload(), secret=_TEST_HS256_SECRET)
        with self.assertRaises(HTTPException) as ctx:
            _verify_supabase_jwt(token)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("unsupported signing algorithm", ctx.exception.detail.lower())

    # ------------------------------------------------------------------
    # 11. Key-type/algorithm mismatch (EC key in RSA slot) → 401
    # ------------------------------------------------------------------
    def test_key_type_algorithm_mismatch_rejected(self):
        # Inject a JWKS that claims RS256 but holds an EC key.
        ec_private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
        ec_public_key = ec_private_key.public_key()
        ec_public_pem = ec_public_key.public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        bad_jwks = {
            "keys": [
                {
                    "kty": "EC",           # EC key…
                    "kid": self.__class__._kid,
                    "alg": "RS256",        # …but claiming RS256 (RSA algorithm)
                    "use": "sig",
                    **jose_jwk.construct(ec_public_pem, algorithm="ES256").to_dict(),
                }
            ]
        }
        jwks_uri = "https://test-project.supabase.co/.well-known/jwks.json"
        _verify_supabase_jwt._jwks_cache[jwks_uri] = bad_jwks

        token = self._make_token()
        with self.assertRaises(HTTPException) as ctx:
            _verify_supabase_jwt(token)
        self.assertEqual(ctx.exception.status_code, 401)

    # ------------------------------------------------------------------
    # 12. Expired RS256 token rejected with 401
    # ------------------------------------------------------------------
    def test_expired_rs256_token_rejected(self):
        token = self._make_token(_valid_hs256_payload(exp=_past_exp()))
        with self.assertRaises(HTTPException) as ctx:
            _verify_supabase_jwt(token)
        self.assertEqual(ctx.exception.status_code, 401)

    # ------------------------------------------------------------------
    # 13. RS256 token without 'sub' claim rejected with 401
    # ------------------------------------------------------------------
    def test_rs256_missing_sub_rejected(self):
        token = self._make_token({"role": "authenticated", "exp": _future_exp()})
        with self.assertRaises(HTTPException) as ctx:
            _verify_supabase_jwt(token)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("subject", ctx.exception.detail.lower())

    # ------------------------------------------------------------------
    # 13b. Malformed JWKS response rejected with 401
    # ------------------------------------------------------------------
    def test_malformed_jwks_response_rejected(self):
        _verify_supabase_jwt._jwks_cache.clear()
        import httpx
        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        mock_resp.json.return_value = {"not_keys": "invalid"}
        with patch.object(httpx, "get", return_value=mock_resp):
            with self.assertRaises(HTTPException) as ctx:
                _verify_supabase_jwt(self._make_token())
            self.assertEqual(ctx.exception.status_code, 401)
            self.assertIn("signing keys", ctx.exception.detail.lower())

    # ------------------------------------------------------------------
    # 13c. Configured SUPABASE_JWT_JWKS_URL path
    # ------------------------------------------------------------------
    def test_configured_supabase_jwt_jwks_url(self):
        custom_url = "https://custom-auth.example.com/jwks.json"
        _verify_supabase_jwt._jwks_cache[custom_url] = self.__class__._jwks
        with patch.dict(os.environ, {"SUPABASE_JWT_JWKS_URL": custom_url, "NEXT_PUBLIC_SUPABASE_URL": ""}):
            token = self._make_token()
            payload = _verify_supabase_jwt(token)
            self.assertEqual(payload["sub"], "student-uuid-0001")


# ===========================================================================
# Test class — Path C: Development bypass
# ===========================================================================

@unittest.skipUnless(CRYPTO_AVAILABLE and FASTAPI_AVAILABLE, "Crypto or FastAPI unavailable")
class TestJWTVerificationDevBypass(unittest.TestCase):
    """Tests for Path C: development-only token bypass."""

    def setUp(self):
        # Deactivate both HS256 and JWKS paths.
        self._patches = [
            patch.object(api_module, "SUPABASE_JWT_SECRET", ""),
            patch.object(api_module, "IS_PRODUCTION", False),
            patch.dict(
                os.environ,
                {
                    "NEXT_PUBLIC_SUPABASE_URL": "",
                    "SUPABASE_JWT_JWKS_URL": "",
                    "DEV_TEST_TOKEN": _TEST_DEV_TOKEN,
                    "NODE_ENV": "development",
                    "PYTHON_API_ENV": "development",
                },
                clear=False,
            ),
        ]
        for p in self._patches:
            p.start()
        if hasattr(_verify_supabase_jwt, "_jwks_cache"):
            _verify_supabase_jwt._jwks_cache.clear()

    def tearDown(self):
        for p in reversed(self._patches):
            p.stop()

    # ------------------------------------------------------------------
    # 14. Exact token match in non-production → accepted
    # ------------------------------------------------------------------
    def test_exact_dev_token_accepted_in_dev_mode(self):
        payload = _verify_supabase_jwt(_TEST_DEV_TOKEN)
        self.assertEqual(payload["sub"], "dev-test-user")
        self.assertTrue(payload.get("dev_bypass"))

    # ------------------------------------------------------------------
    # 15. Wrong token in non-production → 401 (not bypass)
    # ------------------------------------------------------------------
    def test_wrong_token_in_dev_mode_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            _verify_supabase_jwt("wrong-token-value")
        self.assertEqual(ctx.exception.status_code, 401)

    # ------------------------------------------------------------------
    # 16. Bypass disabled when IS_PRODUCTION=True → 500
    # ------------------------------------------------------------------
    def test_dev_bypass_disabled_in_production(self):
        with patch.object(api_module, "IS_PRODUCTION", True):
            with self.assertRaises(HTTPException) as ctx:
                _verify_supabase_jwt(_TEST_DEV_TOKEN)
            # Must return 500 (misconfiguration) not 401 or a payload.
            self.assertEqual(ctx.exception.status_code, 500)

    # ------------------------------------------------------------------
    # 16b. Bypass disabled when NODE_ENV=production → 500
    # ------------------------------------------------------------------
    def test_dev_bypass_disabled_when_node_env_is_production(self):
        with patch.dict(os.environ, {"NODE_ENV": "production"}):
            with self.assertRaises(HTTPException) as ctx:
                _verify_supabase_jwt(_TEST_DEV_TOKEN)
            self.assertEqual(ctx.exception.status_code, 500)

    # ------------------------------------------------------------------
    # 16c. Bypass disabled when PYTHON_API_ENV=production → 500
    # ------------------------------------------------------------------
    def test_dev_bypass_disabled_when_python_api_env_is_production(self):
        with patch.dict(os.environ, {"PYTHON_API_ENV": "production"}):
            with self.assertRaises(HTTPException) as ctx:
                _verify_supabase_jwt(_TEST_DEV_TOKEN)
            self.assertEqual(ctx.exception.status_code, 500)

    # ------------------------------------------------------------------
    # 17. Bypass disabled when DEV_TEST_TOKEN is not set → 401
    # ------------------------------------------------------------------
    def test_dev_bypass_disabled_when_token_env_unset(self):
        with patch.dict(os.environ, {"DEV_TEST_TOKEN": ""}, clear=False):
            with self.assertRaises(HTTPException) as ctx:
                _verify_supabase_jwt("any-token")
            self.assertEqual(ctx.exception.status_code, 401)


# ===========================================================================
# Test class — require_auth FastAPI dependency
# ===========================================================================

@unittest.skipUnless(FASTAPI_AVAILABLE and CRYPTO_AVAILABLE, "FastAPI or crypto unavailable")
class TestRequireAuthDependency(unittest.TestCase):
    """Tests for the require_auth FastAPI dependency and /health access policy."""

    def setUp(self):
        # HS256 path active for these integration-style tests.
        self._patches = [
            patch.object(api_module, "SUPABASE_JWT_SECRET", _TEST_HS256_SECRET),
            patch.object(api_module, "IS_PRODUCTION", False),
        ]
        for p in self._patches:
            p.start()
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        for p in reversed(self._patches):
            p.stop()

    # ------------------------------------------------------------------
    # 19. Missing credential → 401
    # ------------------------------------------------------------------
    def test_missing_bearer_token_returns_401_on_protected_endpoint(self):
        resp = self.client.post(
            "/api/v1/faces/detect",
            files={"image": ("t.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 100, "image/jpeg")},
        )
        self.assertEqual(resp.status_code, 401)

    # ------------------------------------------------------------------
    # 20. /health does NOT require authentication — confirm access policy
    # ------------------------------------------------------------------
    def test_health_endpoint_does_not_require_auth(self):
        """
        /health is intentionally public (no require_auth dependency).
        This test verifies the access policy has NOT been accidentally changed.
        Sending no auth header must still return 200.
        """
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200, "/health must remain publicly accessible")

    # ------------------------------------------------------------------
    # 21. Valid HS256 token → protected endpoint accessible
    # ------------------------------------------------------------------
    def test_valid_hs256_token_grants_access_to_protected_endpoint(self):
        token = _make_hs256_token(_valid_hs256_payload())
        resp = self.client.post(
            "/api/v1/faces/detect",
            headers={"Authorization": f"Bearer {token}"},
            files={"image": ("t.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 100, "image/jpeg")},
        )
        # 200 or 422 (invalid image content) — either proves auth passed.
        self.assertIn(resp.status_code, (200, 422),
                      f"Unexpected status {resp.status_code}: {resp.text[:200]}")

    # ------------------------------------------------------------------
    # 22. 401 response body must not contain the test secret
    # ------------------------------------------------------------------
    def test_auth_error_response_does_not_leak_secret(self):
        resp = self.client.post(
            "/api/v1/faces/detect",
            headers={"Authorization": "Bearer garbage.token.xyz"},
            files={"image": ("t.jpg", b"\xff\xd8\xff\xe0", "image/jpeg")},
        )
        self.assertEqual(resp.status_code, 401)
        self.assertNotIn(_TEST_HS256_SECRET, resp.text)
        self.assertNotIn("SUPABASE_JWT_SECRET", resp.text)


# ===========================================================================
# Entry point
# ===========================================================================

if __name__ == "__main__":
    print("=" * 70)
    print("PUB AttendEye — Step 7C JWT Verification Regression Tests")
    print("=" * 70)
    if not CRYPTO_AVAILABLE:
        print(f"WARNING: Crypto libraries unavailable ({_CRYPTO_ERROR}). All tests skipped.")
        print("Run: pip install cryptography python-jose[cryptography]")
    if not FASTAPI_AVAILABLE:
        print(f"WARNING: FastAPI unavailable ({_FASTAPI_ERROR}). All tests skipped.")
    unittest.main(verbosity=2)
