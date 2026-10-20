# PUB AttendEye — Webcam Enrollment Verification Checklist

> **Scope:** Manual verification steps for the student face-enrollment validation
> flow introduced in Steps 7–7C.  This checklist covers the end-to-end path from
> real student login through camera capture, server-side validation, and the
> JSON response received by the browser.
>
> **Not covered here:** Production Supabase database writes (biometric persistence),
> attendance recording, and anti-spoofing — these features are not yet implemented.
>
> **Who runs this:** A developer or QA engineer on a local development workstation.
> Real device testing on a laptop/desktop with a physical webcam is required for
> items marked **[Real device only]**.

---

## Prerequisites

- Python CV service running: `uvicorn backend.api:app --host 127.0.0.1 --port 8000`
- Next.js dev server running: `npm run dev`
- A real Supabase project with `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` set in `.env.local`.
- A test student account registered in Supabase Auth.

---

## Part 1 — Student Login (Real Authentication)

| # | Step | Expected result | Pass |
|---|------|-----------------|------|
| 1.1 | Open `http://localhost:3000` in a browser. | Home or login page loads. | ☐ |
| 1.2 | Navigate to the student login page and enter **real credentials** for the test student account. | User is redirected to the student dashboard after login. | ☐ |
| 1.3 | Open Browser DevTools → Application → Cookies / Local Storage. Confirm that a Supabase session cookie (`sb-<project>-auth-token`) is present. | Cookie is set. No raw JWT is visible in browser memory or URL parameters. | ☐ |
| 1.4 | Inspect the Network tab. Confirm that `supabase.auth.getUser()` succeeds on the server route without leaking the access token to the browser's response body. | `/api/faces/enroll/validate` route does not echo the token back. | ☐ |

---

## Part 2 — Camera Permission

| # | Step | Expected result | Pass |
|---|------|-----------------|------|
| 2.1 | **[Real device only]** Navigate to the enrollment page on the student dashboard. | Browser displays a permission prompt: *"… wants to use your camera"*. | ☐ |
| 2.2 | Click **Allow**. | Webcam preview appears in the enrollment UI within 2 seconds. | ☐ |
| 2.3 | Deny the permission prompt. | UI shows a clear error message instructing the student to allow camera access. The page does not crash or freeze. | ☐ |
| 2.4 | With permission granted, verify that the video stream is displayed only inside the designated preview element. | Camera feed is not mirrored to any other UI element or to console output. | ☐ |

---

## Part 3 — Multipart Upload and Content Validation

| # | Step | Expected result | Pass |
|---|------|-----------------|------|
| 3.1 | **[Real device only]** Click the capture button three times to collect 3 frames. | 3 JPEG frames are captured and displayed as thumbnails. | ☐ |
| 3.2 | Click **Submit for Validation**. In DevTools → Network, locate the `POST /api/faces/enroll/validate` request. | Request `Content-Type` is `multipart/form-data` with a valid boundary. | ☐ |
| 3.3 | Inspect each part in the multipart payload. | Each image part has `Content-Type: image/jpeg` (or `image/webp`). No raw embedding vector or access token is included in any form part. | ☐ |
| 3.4 | Confirm the total payload size. | Total request body is ≤ 6 MB (3 frames × 2 MB limit each). | ☐ |
| 3.5 | Attempt to upload a non-image file (e.g. a PDF renamed to `.jpg`). | Server returns `HTTP 415 Unsupported Media Type` or the front-end rejects the file before sending. | ☐ |
| 3.6 | Attempt to upload an image file that exceeds 2 MB. | Server returns `HTTP 413 Request Entity Too Large`. The error message does not expose the file path or internal stack trace. | ☐ |

---

## Part 4 — Validation Response Inspection

> The `/api/v1/faces/enroll/validate` endpoint performs **quality validation only**.
> It does **not** persist any biometric templates. The response will never contain
> an `embedding_id`, a database record ID, or a raw 128-dimensional embedding vector.

| # | Step | Expected result | Pass |
|---|------|-----------------|------|
| 4.1 | Inspect the JSON response from `POST /api/faces/enroll/validate`. | Response contains: `success` (boolean), `data` (validation results), `persisted: false`, and `storage_note` indicating no biometrics were saved. | ☐ |
| 4.2 | In `data.samples`, each sample entry has `is_valid`, `sample_index`, and optionally `rejection_reason`. | All fields are present. | ☐ |
| 4.3 | Confirm `data.anti_spoofing_note` is present. | Value states anti-spoofing is NOT implemented in this milestone. | ☐ |
| 4.4 | Search the entire response body for the string `"embedding"`. | The string does not appear. (128D vectors are never returned to the browser.) | ☐ |
| 4.5 | Search the response body for `"embedding_id"` or any database row identifier. | Neither appears. Enrollment validation does not imply persistence. | ☐ |
| 4.6 | With a real face in frame **[Real device only]**, confirm at least one sample is marked `is_valid: true`. | `data.all_valid` is `true` when all frames pass quality checks. | ☐ |
| 4.7 | Cover the camera lens and capture. | Returned samples show `is_valid: false` with a `rejection_reason` (e.g., "No face detected" or "Image too blurry"). | ☐ |

---

## Part 5 — Privacy-Safe Logging

| # | Step | Expected result | Pass |
|---|------|-----------------|------|
| 5.1 | While making a validation request, inspect the Python service's stdout/stderr (uvicorn console). | Log lines include `enroll_validate user=<uuid> samples=N valid=M` — no raw pixels, no embedding vectors, no access tokens. | ☐ |
| 5.2 | Inspect the Next.js server output. | No `access_token`, `sub`, or image binary data appears in any log line. | ☐ |
| 5.3 | Inspect browser DevTools → Console. | No warning, error, or info line contains raw image data or biometric values. | ☐ |

---

## Part 6 — Authentication Failure Scenarios

| # | Step | Expected result | Pass |
|---|------|-----------------|------|
| 6.1 | Log out of the student account. Attempt to call `POST /api/faces/enroll/validate` directly (e.g. via `curl` with no `Authorization` header). | Response is `HTTP 401` with `code: "UNAUTHORIZED"`. No validation is performed. | ☐ |
| 6.2 | Call the endpoint with a deliberately expired or malformed Bearer token. | Response is `HTTP 401`. Error message is generic ("Authentication required") — no internal detail is disclosed. | ☐ |
| 6.3 | Attempt to call `POST /api/v1/faces/enroll/validate` (the Python service directly) with no `Authorization` header. | Python service returns `HTTP 401 Authentication required.` | ☐ |
| 6.4 | Verify that `DEV_TEST_TOKEN` bypass is not available when `NODE_ENV=production`. | With `NODE_ENV=production` set in the environment, sending `x-dev-test-token: <any-value>` returns `HTTP 401`. | ☐ |
| 6.5 | Attempt to submit a `student_id` query parameter or JSON field alongside the request. | The server ignores client-supplied student IDs; only the verified session `sub` is used internally. | ☐ |

---

## Part 7 — Python CV Service Health

| # | Step | Expected result | Pass |
|---|------|-----------------|------|
| 7.1 | `GET http://127.0.0.1:8000/health` | `{"status": "healthy", ...}` with `model_yunet` and `model_sface` both `"available"`. | ☐ |
| 7.2 | Health endpoint accessible without auth. | No `Authorization` header required. `GET /health` returns 200. | ☐ |
| 7.3 | `/docs` (Swagger UI) is accessible in development mode. | Swagger UI loads at `http://127.0.0.1:8000/docs`. | ☐ |
| 7.4 | Confirm that in production mode (`PYTHON_API_ENV=production`), `/docs` returns 404. | Swagger UI is not exposed in production. | ☐ |

---

## Notes

- Items marked **[Real device only]** require a physical webcam and cannot be
  fully verified using automated tests alone.
- Automated tests cover authentication boundary enforcement and image validation
  logic; they do not substitute for physical webcam testing of items 2.1–2.4
  and 4.6–4.7.
- Anti-spoofing (liveness detection) is **not implemented** in this milestone.
  Do not mark any checklist item as passing based on anti-spoofing assumptions.
- Biometric persistence is **not implemented** in this milestone. The enrollment
  validation endpoint is non-persistent by design; see `persisted: false` in
  the response body.
