/**
 * PUB AttendEye — Python CV API Client (Step 7)
 * ================================================
 * Typed client for the FastAPI bridge running at PYTHON_CV_API_URL (default: http://127.0.0.1:8000).
 *
 * Authentication design
 * ---------------------
 * - The Supabase access token is fetched server-side from the authenticated session.
 * - It is forwarded as a Bearer token to the Python service.
 * - No privileged credentials (service-role keys) are sent to or stored in the browser.
 * - Client-supplied student IDs are NEVER forwarded; Python verifies identity from the JWT sub claim.
 *
 * This module is intentionally kept server-safe: it can be used from Server Components,
 * Server Actions, or Route Handlers. Do NOT import it in client components.
 *
 * Usage example (Server Action):
 *   const result = await cvApi.detectFaces(formData, accessToken);
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CV_API_BASE_URL: string =
  process.env.PYTHON_CV_API_URL ?? "http://127.0.0.1:8000";

const CV_API_TIMEOUT_MS = 15_000; // 15 seconds

// ---------------------------------------------------------------------------
// Response Types (mirroring backend/api.py Pydantic models)
// ---------------------------------------------------------------------------

export interface CVApiLandmarkPoint {
  x: number;
  y: number;
}

export interface CVApiBoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CVApiDetectedFace {
  face_id: string;
  box: CVApiBoundingBox;
  confidence: number;
  landmarks: Record<string, CVApiLandmarkPoint>;
}

export interface CVApiDetectResponse {
  detected_faces: CVApiDetectedFace[];
  face_count: number;
  image_width: number;
  image_height: number;
  processing_time_ms: number;
}

export interface CVApiSampleValidationResult {
  sample_index: number;
  is_valid: boolean;
  blur_score: number | null;
  detection_confidence: number | null;
  face_box: CVApiBoundingBox | null;
  rejection_reason: string | null;
}

export interface CVApiEnrollValidateResponse {
  all_valid: boolean;
  valid_sample_count: number;
  total_sample_count: number;
  samples: CVApiSampleValidationResult[];
  model_version: string;
  anti_spoofing_note: string;
  message: string;
}

export interface CVApiFaceMatchResult {
  face_id: string;
  box: CVApiBoundingBox;
  detection_confidence: number;
  decision: "matched_candidate" | "review_required" | "unknown";
  reason: string;
  candidate_student_id: string | null;
  candidate_name: string | null;
  similarity_score: number;
  score_margin: number | null;
  is_collision: boolean;
}

export interface CVApiMatchPreviewResponse {
  dev_mode_only: boolean;
  course_code: string;
  section: string;
  total_detected_faces: number;
  matched_candidates_count: number;
  review_required_count: number;
  unknown_count: number;
  roster_size: number;
  face_results: CVApiFaceMatchResult[];
  anti_spoofing_note: string;
  attendance_note: string;
}

export interface CVApiHealthResponse {
  status: "healthy" | "degraded";
  env: string;
  model_yunet: string;
  model_sface: string;
  model_version_tag: string;
  timestamp: string;
  message?: string;
}

export interface CVApiError {
  detail: string;
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

class CVApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly detail: string
  ) {
    super(`CV API error ${statusCode}: ${detail}`);
    this.name = "CVApiClientError";
  }

  get status(): number {
    return this.statusCode;
  }
}

async function _cvFetch<T>(
  path: string,
  init: RequestInit,
  accessToken?: string
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  // Use AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CV_API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${CV_API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new CVApiClientError(
        504,
        "Python CV service timed out. Ensure it is running on port 8000."
      );
    }
    throw new CVApiClientError(
      503,
      "Python CV service is unreachable. Run: uvicorn backend.api:app --port 8000"
    );
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = (await response.json()) as CVApiError;
      detail = errBody.detail ?? detail;
    } catch {
      // ignore JSON parse error
    }
    throw new CVApiClientError(response.status, detail);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API client
// ---------------------------------------------------------------------------

export const cvApi = {
  /**
   * Check Python CV service health and model availability.
   * Does not require authentication.
   */
  async health(): Promise<CVApiHealthResponse> {
    return _cvFetch<CVApiHealthResponse>("/health", { method: "GET" });
  },

  /**
   * Detect faces in an uploaded image using YuNet.
   * Requires a valid Supabase access token (forwarded server-side).
   *
   * @param imageBlob  The image file or blob to analyse.
   * @param accessToken  Supabase access token obtained from the server-side session.
   */
  async detectFaces(
    imageBlob: Blob,
    accessToken: string
  ): Promise<CVApiDetectResponse> {
    const form = new FormData();
    form.append("image", imageBlob, "frame.jpg");

    return _cvFetch<CVApiDetectResponse>(
      "/api/v1/faces/detect",
      { method: "POST", body: form },
      accessToken
    );
  },

  /**
   * Validate face enrollment samples for quality.
   * Does NOT persist biometric data or return embedding vectors.
   * Requires a valid Supabase access token.
   *
   * @param imageBlobs  Array of 1–5 image blobs (webcam captures).
   * @param accessToken  Supabase access token from server-side session.
   */
  async validateEnrollmentSamples(
    imageBlobs: Blob[],
    accessToken: string
  ): Promise<CVApiEnrollValidateResponse> {
    if (imageBlobs.length === 0 || imageBlobs.length > 5) {
      throw new CVApiClientError(
        422,
        "Provide between 1 and 5 enrollment sample images."
      );
    }

    const form = new FormData();
    imageBlobs.forEach((blob, idx) => {
      form.append("samples", blob, `sample_${idx + 1}.jpg`);
    });

    return _cvFetch<CVApiEnrollValidateResponse>(
      "/api/v1/faces/enroll/validate",
      { method: "POST", body: form },
      accessToken
    );
  },

  /**
   * Preview face matching against a mock roster (DEVELOPMENT only).
   * Returns face-match decisions without writing any attendance records.
   * Blocked in production mode on the Python service.
   *
   * @param imageBlob        Classroom photo or video frame.
   * @param courseCode       e.g. "CSE 2205"
   * @param section          e.g. "Section A"
   * @param mockRoster       Array of {student_id, name, embedding} objects.
   *                         Embeddings must be 128-element unit-normalized float arrays.
   * @param accessToken      Supabase access token from server-side session.
   */
  async matchPreview(
    imageBlob: Blob,
    courseCode: string,
    section: string,
    mockRoster: Array<{
      student_id: string;
      name: string;
      embedding: number[];
    }>,
    accessToken: string
  ): Promise<CVApiMatchPreviewResponse> {
    const form = new FormData();
    form.append("image", imageBlob, "classroom.jpg");
    form.append("course_code", courseCode);
    form.append("section", section);
    form.append("mock_roster_json", JSON.stringify(mockRoster));

    return _cvFetch<CVApiMatchPreviewResponse>(
      "/api/v1/faces/match/preview",
      { method: "POST", body: form },
      accessToken
    );
  },

  /**
   * Extract unit-normalized 128D SFace biometric embedding vector for server-side persistence.
   * Requires a valid Supabase access token.
   */
  async extractEnrollmentTemplate(
    imageBlobs: Blob[],
    accessToken: string
  ): Promise<{
    all_valid: boolean;
    model_version: string;
    samples_count: number;
    embedding: number[] | null;
    message: string;
  }> {
    if (imageBlobs.length === 0 || imageBlobs.length > 5) {
      throw new CVApiClientError(422, "Provide between 1 and 5 enrollment sample images.");
    }
    const form = new FormData();
    imageBlobs.forEach((blob, idx) => {
      form.append("samples", blob, `sample_${idx + 1}.jpg`);
    });
    return _cvFetch(
      "/api/v1/faces/enroll/extract_template",
      { method: "POST", body: form },
      accessToken
    );
  },

  /**
   * Run multi-face identity matching for live classroom attendance against course section roster.
   * Requires a valid Supabase access token.
   */
  async matchFaces(
    imageBlob: Blob,
    courseCode: string,
    section: string,
    roster: Array<{
      student_id: string;
      name: string;
      embedding: number[];
    }>,
    accessToken: string
  ): Promise<CVApiMatchPreviewResponse> {
    const form = new FormData();
    form.append("image", imageBlob, "classroom.jpg");
    form.append("course_code", courseCode);
    form.append("section", section);
    form.append("roster_json", JSON.stringify(roster));

    return _cvFetch<CVApiMatchPreviewResponse>(
      "/api/v1/faces/match",
      { method: "POST", body: form },
      accessToken
    );
  },
} as const;

export { CVApiClientError };
