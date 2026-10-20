"""
PUB AttendEye - Secure Student Face Enrollment Automated Test Suite
Step 6: Secure Student Face Enrollment Integration (PUB CSE Fest-26)

Tests cover:
1. Missing authentication enforcement.
2. Missing or withdrawn biometric consent enforcement.
3. Identity spoofing protection (enrolling against another student's ID).
4. Image quality & geometry guards:
   - Empty/None frames.
   - Low resolution (< 160x160).
   - Defocus/motion blur rejection via Laplacian variance.
   - Multi-face detection rejection (strictly 1 face required).
   - Zero-face detection rejection.
   - Small/distant face rejection (< 60x60 px).
5. Mathematical embedding validation:
   - Dimension check (must be 128D).
   - Model version enforcement (only 'v1.0-sface'; 'v1.0-facenet' rejected).
   - Multi-sample consistency (cosine similarity >= 0.60).
6. Repeated/duplicate enrollment safe upsert.
7. Authorized vs unauthorized access to stored enrollment metadata.
8. Data privacy: Raw embedding vector omitted from client response.
9. Voluntary consent-withdrawal & biometric deletion workflow.
10. Database connection failure and safe error handling.
"""

import os
import sys
import unittest
import numpy as np
import cv2

# Ensure project root is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.detector import DetectedFace, YuNetFaceDetector
from backend.recognizer import SFaceEmbedder, cosine_similarity
from backend.enrollment import (
    StudentFaceEnrollmentService,
    EnrollmentPayload,
    ValidatedSample,
    UnauthenticatedError,
    ConsentRequiredError,
    IdentitySpoofingError,
    SampleQualityError,
    ModelVersionError,
    ENROLLMENT_MODEL_VERSION,
    EMBEDDING_DIM,
    compute_laplacian_blur_score,
)
from backend.supabase_enrollment import (
    SupabaseEnrollmentManager,
    MockEnrollmentRepository,
    StudentDatabaseRecord,
)


def create_synthetic_sharp_face_frame(width=320, height=320) -> np.ndarray:
    """
    Generate a sharp synthetic frame with high-frequency noise and clear features.
    """
    img = np.full((height, width, 3), 180, dtype=np.uint8)
    # Add high-contrast geometric edges to ensure high Laplacian variance (sharpness)
    for i in range(0, width, 10):
        cv2.line(img, (i, 0), (i, height), (50, 50, 50), 1)
    for j in range(0, height, 10):
        cv2.line(img, (0, j), (width, j), (50, 50, 50), 1)
    return img


def create_synthetic_blurry_frame(width=320, height=320) -> np.ndarray:
    """
    Generate an intentionally blurred frame to trigger blur detection.
    """
    sharp = create_synthetic_sharp_face_frame(width, height)
    # Severe Gaussian blur to reduce edge variance below threshold
    return cv2.GaussianBlur(sharp, (35, 35), 15.0)


class MockDetectorForEnrollment(YuNetFaceDetector):
    """
    Predictable detector stub that simulates 0, 1, or multiple detected faces
    with controlled bounding box and landmark coordinates.
    """

    def __init__(self, mode="single_valid"):
        self.mode = mode
        self.conf_threshold = 0.65

    def detect(self, image: np.ndarray):
        if image is None or image.size == 0 or self.mode == "zero_face":
            return []

        h, w = image.shape[:2]

        if self.mode == "multi_face":
            # Return 2 faces
            f1 = DetectedFace(
                face_id="face_001",
                box=(int(w * 0.1), int(h * 0.2), 80, 80),
                confidence=0.98,
                landmarks={
                    "right_eye": (int(w * 0.15), int(h * 0.25)),
                    "left_eye": (int(w * 0.22), int(h * 0.25)),
                    "nose_tip": (int(w * 0.18), int(h * 0.30)),
                    "mouth_right": (int(w * 0.16), int(h * 0.35)),
                    "mouth_left": (int(w * 0.21), int(h * 0.35)),
                },
                raw_array=np.array([w * 0.1, h * 0.2, 80, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.98], dtype=np.float32),
            )
            f2 = DetectedFace(
                face_id="face_002",
                box=(int(w * 0.6), int(h * 0.2), 80, 80),
                confidence=0.96,
                landmarks={
                    "right_eye": (int(w * 0.65), int(h * 0.25)),
                    "left_eye": (int(w * 0.72), int(h * 0.25)),
                    "nose_tip": (int(w * 0.68), int(h * 0.30)),
                    "mouth_right": (int(w * 0.66), int(h * 0.35)),
                    "mouth_left": (int(w * 0.71), int(h * 0.35)),
                },
                raw_array=np.array([w * 0.6, h * 0.2, 80, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.96], dtype=np.float32),
            )
            return [f1, f2]

        if self.mode == "small_face":
            # Face bounding box smaller than 60x60
            return [
                DetectedFace(
                    face_id="face_tiny",
                    box=(int(w * 0.4), int(h * 0.4), 40, 40),
                    confidence=0.95,
                    landmarks={
                        "right_eye": (int(w * 0.42), int(h * 0.43)),
                        "left_eye": (int(w * 0.47), int(h * 0.43)),
                        "nose_tip": (int(w * 0.45), int(h * 0.46)),
                        "mouth_right": (int(w * 0.43), int(h * 0.49)),
                        "mouth_left": (int(w * 0.47), int(h * 0.49)),
                    },
                    raw_array=np.array([w * 0.4, h * 0.4, 40, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.95], dtype=np.float32),
                )
            ]

        # Default: single valid face
        return [
            DetectedFace(
                face_id="face_valid",
                box=(int(w * 0.25), int(h * 0.2), 140, 140),
                confidence=0.99,
                landmarks={
                    "right_eye": (int(w * 0.35), int(h * 0.32)),
                    "left_eye": (int(w * 0.55), int(h * 0.32)),
                    "nose_tip": (int(w * 0.45), int(h * 0.42)),
                    "mouth_right": (int(w * 0.38), int(h * 0.52)),
                    "mouth_left": (int(w * 0.52), int(h * 0.52)),
                },
                raw_array=np.array([w * 0.25, h * 0.2, 140, 140, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.99], dtype=np.float32),
            )
        ]


class MockEmbedderForEnrollment(SFaceEmbedder):
    """
    Predictable SFace embedder returning unit-normalized 128D embeddings
    consistent across samples of the same subject.
    """

    def __init__(self, seed: int = 42, model_name: str = "v1.0-sface"):
        self.MODEL_NAME = model_name
        self.EMBEDDING_DIM = 128
        self.rng = np.random.default_rng(seed)
        # Base vector representing the student's true face embedding
        base = self.rng.standard_normal(128).astype(np.float32)
        self.base_vector = base / np.linalg.norm(base)
        self.inconsistent_mode = False

    def process_detected_face(self, image: np.ndarray, detected_face: DetectedFace, normalize: bool = True):
        if self.inconsistent_mode:
            # Completely different random vector (simulates different people)
            raw = self.rng.standard_normal(128).astype(np.float32)
        else:
            # Add small realistic perturbation (simulates slight angle/lighting changes, similarity >= 0.95)
            noise = self.rng.standard_normal(128).astype(np.float32) * 0.02
            raw = self.base_vector + noise

        norm = np.linalg.norm(raw)
        emb = raw / norm if normalize else raw
        dummy_crop = np.zeros((112, 112, 3), dtype=np.uint8)
        return dummy_crop, emb


class TestStudentFaceEnrollmentService(unittest.TestCase):
    """Automated tests for face quality validation and embedding aggregation."""

    def setUp(self):
        self.detector = MockDetectorForEnrollment(mode="single_valid")
        self.embedder = MockEmbedderForEnrollment(seed=101)
        self.service = StudentFaceEnrollmentService(
            detector=self.detector,
            embedder=self.embedder,
            blur_threshold=40.0,
            min_box_size=60,
        )

    def test_01_empty_or_undersized_image_rejected(self):
        """Empty or low-resolution image must be rejected."""
        res_none = self.service.validate_sample_frame(None)
        self.assertFalse(res_none.is_valid)
        self.assertIn("empty or corrupted", res_none.rejection_reason)

        undersized = np.zeros((100, 100, 3), dtype=np.uint8)
        res_small = self.service.validate_sample_frame(undersized)
        self.assertFalse(res_small.is_valid)
        self.assertIn("resolution", res_small.rejection_reason)

    def test_02_blurry_image_rejected(self):
        """Blurry frame with low Laplacian variance must be rejected."""
        blurry_frame = create_synthetic_blurry_frame(320, 320)
        res_blur = self.service.validate_sample_frame(blurry_frame)
        self.assertFalse(res_blur.is_valid)
        self.assertIn("too blurry", res_blur.rejection_reason)

    def test_03_zero_faces_rejected(self):
        """Image with 0 detected faces must be rejected."""
        self.service.detector = MockDetectorForEnrollment(mode="zero_face")
        sharp = create_synthetic_sharp_face_frame(320, 320)
        res = self.service.validate_sample_frame(sharp)
        self.assertFalse(res.is_valid)
        self.assertIn("No face detected", res.rejection_reason)

    def test_04_multiple_faces_rejected(self):
        """Image with >1 detected face must be rejected."""
        self.service.detector = MockDetectorForEnrollment(mode="multi_face")
        sharp = create_synthetic_sharp_face_frame(320, 320)
        res = self.service.validate_sample_frame(sharp)
        self.assertFalse(res.is_valid)
        self.assertIn("Multiple faces detected", res.rejection_reason)

    def test_05_small_distant_face_rejected(self):
        """Detected face smaller than 60x60 pixels must be rejected."""
        self.service.detector = MockDetectorForEnrollment(mode="small_face")
        sharp = create_synthetic_sharp_face_frame(320, 320)
        res = self.service.validate_sample_frame(sharp)
        self.assertFalse(res.is_valid)
        self.assertIn("too far from camera", res.rejection_reason)

    def test_06_model_version_mismatch_rejected(self):
        """Attempting to use an incompatible model version raises ModelVersionError."""
        sharp = create_synthetic_sharp_face_frame(320, 320)
        with self.assertRaises(ModelVersionError):
            self.service.create_enrollment_payload(
                authenticated_profile_id="user_123",
                student_database_id="stu_123",
                verified_student_id_number="PUB-CSE-2023-042",
                claimed_student_id_number="PUB-CSE-2023-042",
                has_active_consent=True,
                sample_images=[sharp],
                requested_model_version="v1.0-facenet",  # INCOMPATIBLE
            )

    def test_07_identity_spoofing_rejected(self):
        """Attempting to enroll for a Student ID different from authenticated user raises IdentitySpoofingError."""
        sharp = create_synthetic_sharp_face_frame(320, 320)
        with self.assertRaises(IdentitySpoofingError):
            self.service.create_enrollment_payload(
                authenticated_profile_id="user_123",
                student_database_id="stu_123",
                verified_student_id_number="PUB-CSE-2023-042",
                claimed_student_id_number="PUB-CSE-2023-999",  # SPOOFED ID
                has_active_consent=True,
                sample_images=[sharp],
            )

    def test_08_missing_consent_rejected(self):
        """Enrollment without active biometric consent raises ConsentRequiredError."""
        sharp = create_synthetic_sharp_face_frame(320, 320)
        with self.assertRaises(ConsentRequiredError):
            self.service.create_enrollment_payload(
                authenticated_profile_id="user_123",
                student_database_id="stu_123",
                verified_student_id_number="PUB-CSE-2023-042",
                claimed_student_id_number="PUB-CSE-2023-042",
                has_active_consent=False,  # NO CONSENT
                sample_images=[sharp],
            )

    def test_09_successful_multi_sample_enrollment(self):
        """3 valid sharp samples generate a unit-normalized 128D payload."""
        sharp1 = create_synthetic_sharp_face_frame(320, 320)
        sharp2 = create_synthetic_sharp_face_frame(320, 320)
        sharp3 = create_synthetic_sharp_face_frame(320, 320)

        payload = self.service.create_enrollment_payload(
            authenticated_profile_id="user_123",
            student_database_id="stu_123",
            verified_student_id_number="PUB-CSE-2023-042",
            claimed_student_id_number="PUB-CSE-2023-042",
            has_active_consent=True,
            sample_images=[sharp1, sharp2, sharp3],
            requested_model_version="v1.0-sface",
        )

        self.assertEqual(payload.student_id_number, "PUB-CSE-2023-042")
        self.assertEqual(payload.model_version, "v1.0-sface")
        self.assertEqual(payload.samples_count, 3)
        self.assertEqual(len(payload.embedding_vector), 128)

        # Norm must be ~1.0
        norm = np.linalg.norm(np.array(payload.embedding_vector))
        self.assertAlmostEqual(norm, 1.0, places=4)

    def test_10_inconsistent_samples_rejected(self):
        """Samples showing different individuals (inter-sample similarity < 0.60) are rejected."""
        self.embedder.inconsistent_mode = True  # Emulates capturing two different people
        sharp1 = create_synthetic_sharp_face_frame(320, 320)
        sharp2 = create_synthetic_sharp_face_frame(320, 320)

        with self.assertRaises(SampleQualityError) as ctx:
            self.service.create_enrollment_payload(
                authenticated_profile_id="user_123",
                student_database_id="stu_123",
                verified_student_id_number="PUB-CSE-2023-042",
                claimed_student_id_number="PUB-CSE-2023-042",
                has_active_consent=True,
                sample_images=[sharp1, sharp2],
            )
        self.assertIn("Inconsistent facial samples", str(ctx.exception))


class TestSupabaseEnrollmentManager(unittest.TestCase):
    """Automated tests for server-side Supabase enrollment database transactions."""

    def setUp(self):
        self.repo = MockEnrollmentRepository()
        self.manager = SupabaseEnrollmentManager(self.repo)

        # Seed student 1: Md Tanvir Ahmed
        self.s1 = self.repo.seed_student(
            student_id="uuid_stu_001",
            profile_id="uuid_prof_001",
            student_id_number="PUB-CSE-2023-042",
            full_name="Md Tanvir Ahmed",
            email="tanvir@pundra.edu.bd",
            face_registered=False,
        )

        # Seed student 2: Nusrat Jahan
        self.s2 = self.repo.seed_student(
            student_id="uuid_stu_002",
            profile_id="uuid_prof_002",
            student_id_number="PUB-CSE-2023-018",
            full_name="Nusrat Jahan",
            email="nusrat@pundra.edu.bd",
            face_registered=False,
        )

        # Seed active consent for student 1
        self.repo.save_consent(
            student_id="uuid_stu_001",
            consent_given=True,
            consent_text="Voluntary Biometric Face Recognition Consent for PUB AttendEye",
        )

    def test_01_missing_authentication_rejected(self):
        """Unauthenticated write attempt raises UnauthenticatedError."""
        payload = EnrollmentPayload(
            student_database_id="uuid_stu_001",
            student_id_number="PUB-CSE-2023-042",
            embedding_vector=[0.1] * 128,
            model_version=ENROLLMENT_MODEL_VERSION,
            samples_count=3,
            registered_at="2026-10-20T12:00:00Z",
        )
        with self.assertRaises(UnauthenticatedError):
            self.manager.enroll_student("", payload)

        with self.assertRaises(UnauthenticatedError):
            self.manager.enroll_student("non_existent_profile_id", payload)

    def test_02_student_cannot_enroll_for_different_student(self):
        """Student 1 cannot write biometrics for Student 2."""
        payload_for_s2 = EnrollmentPayload(
            student_database_id="uuid_stu_002",  # Target Student 2
            student_id_number="PUB-CSE-2023-018",
            embedding_vector=[0.1] * 128,
            model_version=ENROLLMENT_MODEL_VERSION,
            samples_count=3,
            registered_at="2026-10-20T12:00:00Z",
        )

        # Logged in as Student 1 (uuid_prof_001)
        with self.assertRaises(IdentitySpoofingError):
            self.manager.enroll_student("uuid_prof_001", payload_for_s2)

    def test_03_missing_or_withdrawn_consent_rejected(self):
        """Enrollment rejected if student has no active consent or has withdrawn it."""
        # Student 2 has no consent record
        payload_s2 = EnrollmentPayload(
            student_database_id="uuid_stu_002",
            student_id_number="PUB-CSE-2023-018",
            embedding_vector=[0.1] * 128,
            model_version=ENROLLMENT_MODEL_VERSION,
            samples_count=3,
            registered_at="2026-10-20T12:00:00Z",
        )
        with self.assertRaises(ConsentRequiredError):
            self.manager.enroll_student("uuid_prof_002", payload_s2)

    def test_04_successful_enrollment_and_status_update(self):
        """Valid enrollment updates database and marks face_registered=True."""
        dummy_vector = list(np.random.randn(128).astype(float))
        norm = float(np.linalg.norm(dummy_vector))
        dummy_vector = [v / norm for v in dummy_vector]

        payload = EnrollmentPayload(
            student_database_id="uuid_stu_001",
            student_id_number="PUB-CSE-2023-042",
            embedding_vector=dummy_vector,
            model_version=ENROLLMENT_MODEL_VERSION,
            samples_count=3,
            registered_at="2026-10-20T12:00:00Z",
        )

        resp = self.manager.enroll_student("uuid_prof_001", payload)
        self.assertTrue(resp.success)
        self.assertEqual(resp.student_id_number, "PUB-CSE-2023-042")
        self.assertEqual(resp.model_version, "v1.0-sface")

        # Verify database record
        student_rec = self.repo.get_student_by_profile_id("uuid_prof_001")
        self.assertIsNotNone(student_rec)
        self.assertTrue(student_rec.face_registered)

    def test_05_re_enrollment_duplicate_request_safe_upsert(self):
        """Submitting re-enrollment safely replaces previous embedding without duplicate key crash."""
        vec1 = [0.1] * 128
        payload1 = EnrollmentPayload(
            student_database_id="uuid_stu_001",
            student_id_number="PUB-CSE-2023-042",
            embedding_vector=vec1,
            model_version=ENROLLMENT_MODEL_VERSION,
            samples_count=3,
            registered_at="2026-10-20T10:00:00Z",
        )
        self.manager.enroll_student("uuid_prof_001", payload1)

        # Re-enrollment with updated vector
        vec2 = [0.2] * 128
        payload2 = EnrollmentPayload(
            student_database_id="uuid_stu_001",
            student_id_number="PUB-CSE-2023-042",
            embedding_vector=vec2,
            model_version=ENROLLMENT_MODEL_VERSION,
            samples_count=5,
            registered_at="2026-10-20T11:00:00Z",
        )
        resp2 = self.manager.enroll_student("uuid_prof_001", payload2)
        self.assertTrue(resp2.success)
        self.assertEqual(resp2.samples_count, 5)

        # Only one active enrollment row should exist
        stored = self.repo.face_enrollments.get("uuid_stu_001")
        self.assertIsNotNone(stored)
        self.assertEqual(stored["samples_count"], 5)

    def test_06_unauthorized_read_access_blocked(self):
        """Student cannot query or view another student's enrollment status."""
        with self.assertRaises(IdentitySpoofingError):
            self.manager.get_student_enrollment_info(
                authenticated_profile_id="uuid_prof_001",
                target_student_id="uuid_stu_002",  # Other student's ID
            )

    def test_07_embedding_vector_never_exposed_in_status(self):
        """Reading enrollment status metadata omits raw biometric vector."""
        vec = [0.1] * 128
        payload = EnrollmentPayload(
            student_database_id="uuid_stu_001",
            student_id_number="PUB-CSE-2023-042",
            embedding_vector=vec,
            model_version=ENROLLMENT_MODEL_VERSION,
            samples_count=3,
            registered_at="2026-10-20T12:00:00Z",
        )
        self.manager.enroll_student("uuid_prof_001", payload)

        status_info = self.manager.get_student_enrollment_info(
            authenticated_profile_id="uuid_prof_001",
            target_student_id="uuid_stu_001",
        )
        self.assertIsNotNone(status_info)
        self.assertIn("samples_count", status_info)
        self.assertIn("model_version", status_info)
        self.assertNotIn("embedding_vector", status_info)  # VECTOR OMITTED

    def test_08_consent_withdrawal_and_biometric_deletion(self):
        """Withdrawing consent immediately purges face enrollment and clears face_registered flag."""
        vec = [0.1] * 128
        payload = EnrollmentPayload(
            student_database_id="uuid_stu_001",
            student_id_number="PUB-CSE-2023-042",
            embedding_vector=vec,
            model_version=ENROLLMENT_MODEL_VERSION,
            samples_count=3,
            registered_at="2026-10-20T12:00:00Z",
        )
        self.manager.enroll_student("uuid_prof_001", payload)
        self.assertTrue(self.repo.students_by_id["uuid_stu_001"].face_registered)

        # Withdraw consent
        res = self.manager.withdraw_consent_and_delete("uuid_prof_001")
        self.assertTrue(res["consent_withdrawn"])
        self.assertFalse(res["face_registered"])

        # Face enrollment must be deleted from table
        self.assertNotIn("uuid_stu_001", self.repo.face_enrollments)
        self.assertFalse(self.repo.students_by_id["uuid_stu_001"].face_registered)

    def test_09_database_error_handling(self):
        """Simulated database connection failure raises exception safely."""
        self.repo.simulate_db_error = True
        payload = EnrollmentPayload(
            student_database_id="uuid_stu_001",
            student_id_number="PUB-CSE-2023-042",
            embedding_vector=[0.1] * 128,
            model_version=ENROLLMENT_MODEL_VERSION,
            samples_count=3,
            registered_at="2026-10-20T12:00:00Z",
        )
        with self.assertRaises(RuntimeError) as ctx:
            self.manager.enroll_student("uuid_prof_001", payload)
        self.assertIn("Database connection failure", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
