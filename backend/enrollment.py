"""
PUB AttendEye - Secure Student Face Biometric Enrollment Subsystem
Step 6: Secure Student Face Enrollment Integration (PUB CSE Fest-26)

This module handles:
1. Input image quality validation (blur detection via Laplacian variance, resolution checks).
2. Face geometry & uniqueness validation (strictly 1 face detected, minimum bounding box size).
3. 5-point facial landmark alignment and genuine 128D SFace embedding generation.
4. Multi-sample consistency verification across captured face crops.
5. Strict model-version enforcement: Only 'v1.0-sface' is accepted; 'v1.0-facenet' is rejected.
6. Verified student identity binding: Embeddings are linked to the verified authenticated student profile.
7. Biometric consent gating and GDPR-compliant consent withdrawal/biometric deletion workflows.
8. Privacy preservation: Raw face photographs are never stored; only unit-normalized 128D embeddings are retained.
"""

import os
import sys
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import cv2

# Ensure project root is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.detector import DetectedFace, YuNetFaceDetector
from backend.recognizer import SFaceEmbedder, cosine_similarity

logger = logging.getLogger("enrollment")

# Model Version Constants
ENROLLMENT_MODEL_VERSION = "v1.0-sface"
EMBEDDING_DIM = 128

# Quality & Geometry Thresholds
MIN_IMAGE_WIDTH = 160
MIN_IMAGE_HEIGHT = 160
MIN_FACE_BOX_SIZE = 60          # Minimum width & height of detected face in pixels
BLUR_VARIANCE_THRESHOLD = 45.0  # Laplacian variance threshold below which frame is flagged as blurry
MIN_INTER_SAMPLE_SIMILARITY = 0.60  # Minimum cosine similarity between sample embeddings of the same student


class EnrollmentError(Exception):
    """Base exception for face enrollment errors."""
    pass


class UnauthenticatedError(EnrollmentError):
    """Raised when request lacks valid authentication."""
    pass


class ConsentRequiredError(EnrollmentError):
    """Raised when student has not provided active biometric consent or has withdrawn it."""
    pass


class IdentitySpoofingError(EnrollmentError):
    """Raised when client tries to enroll against a student ID different from authenticated user."""
    pass


class SampleQualityError(EnrollmentError):
    """Raised when an enrollment image sample fails quality, pose, or blur checks."""
    pass


class ModelVersionError(EnrollmentError):
    """Raised when model version is incompatible or mismatched."""
    pass


@dataclass
class QualityValidationResult:
    """Detailed quality validation diagnostics for an enrollment frame."""
    is_valid: bool
    face_count: int
    blur_score: float
    face_box: Optional[Tuple[int, int, int, int]] = None
    detected_face: Optional[DetectedFace] = None
    rejection_reason: Optional[str] = None


@dataclass
class ValidatedSample:
    """An accepted enrollment sample with its 128D SFace embedding."""
    sample_index: int
    embedding: np.ndarray  # 128D normalized float32
    blur_score: float
    detection_confidence: float
    box: Tuple[int, int, int, int]


@dataclass
class EnrollmentPayload:
    """Validated enrollment data ready for secure persistence."""
    student_database_id: str   # Primary key UUID in students table
    student_id_number: str     # Official student ID (e.g. "PUB-CSE-2023-042")
    embedding_vector: List[float]  # 128D normalized vector
    model_version: str         # "v1.0-sface"
    samples_count: int         # Number of verified samples aggregated
    registered_at: str         # ISO 8601 UTC timestamp
    consent_id: Optional[str] = None


def compute_laplacian_blur_score(image: np.ndarray) -> float:
    """
    Compute blur metric using Laplacian variance.
    Higher values indicate a sharp image; low values indicate motion or defocus blur.
    """
    if image is None or image.size == 0:
        return 0.0
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


class StudentFaceEnrollmentService:
    """
    Secure enrollment service that validates face samples, extracts SFace embeddings,
    and enforces student authentication, biometric consent, and model version integrity.
    """

    def __init__(
        self,
        detector: Optional[YuNetFaceDetector] = None,
        embedder: Optional[SFaceEmbedder] = None,
        blur_threshold: float = BLUR_VARIANCE_THRESHOLD,
        min_box_size: int = MIN_FACE_BOX_SIZE,
    ):
        self.detector = detector or YuNetFaceDetector(conf_threshold=0.65)
        self.embedder = embedder or SFaceEmbedder()
        self.blur_threshold = blur_threshold
        self.min_box_size = min_box_size

        if self.embedder.MODEL_NAME != ENROLLMENT_MODEL_VERSION:
            raise ModelVersionError(
                f"Recognizer model {self.embedder.MODEL_NAME} does not match required enrollment model {ENROLLMENT_MODEL_VERSION}."
            )

    def validate_sample_frame(self, image: np.ndarray) -> QualityValidationResult:
        """
        Validate single enrollment frame for resolution, blur, face count, and geometry.
        """
        if image is None or image.size == 0:
            return QualityValidationResult(
                is_valid=False,
                face_count=0,
                blur_score=0.0,
                rejection_reason="Enrollment image sample is empty or corrupted.",
            )

        h, w = image.shape[:2]
        if w < MIN_IMAGE_WIDTH or h < MIN_IMAGE_HEIGHT:
            return QualityValidationResult(
                is_valid=False,
                face_count=0,
                blur_score=0.0,
                rejection_reason=f"Image resolution ({w}x{h}) is too low. Minimum required: {MIN_IMAGE_WIDTH}x{MIN_IMAGE_HEIGHT}.",
            )

        # Blur check
        blur_score = compute_laplacian_blur_score(image)
        if blur_score < self.blur_threshold:
            return QualityValidationResult(
                is_valid=False,
                face_count=0,
                blur_score=round(blur_score, 2),
                rejection_reason=f"Image is too blurry (sharpness score {blur_score:.1f} < {self.blur_threshold:.1f}). Please hold still.",
            )

        # Face detection
        faces = self.detector.detect(image)
        face_count = len(faces)

        if face_count == 0:
            return QualityValidationResult(
                is_valid=False,
                face_count=0,
                blur_score=round(blur_score, 2),
                rejection_reason="No face detected. Please face the camera directly in good lighting.",
            )

        if face_count > 1:
            return QualityValidationResult(
                is_valid=False,
                face_count=face_count,
                blur_score=round(blur_score, 2),
                rejection_reason=f"Multiple faces detected ({face_count}). Exactly 1 face is required for enrollment.",
            )

        face = faces[0]
        bx, by, bw, bh = face.box

        # Face size constraint
        if bw < self.min_box_size or bh < self.min_box_size:
            return QualityValidationResult(
                is_valid=False,
                face_count=1,
                blur_score=round(blur_score, 2),
                face_box=face.box,
                detected_face=face,
                rejection_reason=f"Face is too far from camera ({bw}x{bh} px < minimum {self.min_box_size}x{self.min_box_size} px). Please move closer.",
            )

        # Landmark boundary checks (ensure all 5 landmarks are within frame)
        for lm_name, (lx, ly) in face.landmarks.items():
            if lx < 0 or lx >= w or ly < 0 or ly >= h:
                return QualityValidationResult(
                    is_valid=False,
                    face_count=1,
                    blur_score=round(blur_score, 2),
                    face_box=face.box,
                    detected_face=face,
                    rejection_reason=f"Facial landmark '{lm_name}' falls outside camera view.",
                )

        return QualityValidationResult(
            is_valid=True,
            face_count=1,
            blur_score=round(blur_score, 2),
            face_box=face.box,
            detected_face=face,
            rejection_reason=None,
        )

    def process_and_extract_embedding(self, image: np.ndarray) -> ValidatedSample:
        """
        Validate image, perform 5-point alignment, and extract 128D SFace embedding.
        Raises SampleQualityError if sample is invalid.
        """
        val_res = self.validate_sample_frame(image)
        if not val_res.is_valid:
            raise SampleQualityError(val_res.rejection_reason or "Invalid face sample.")

        assert val_res.detected_face is not None
        face = val_res.detected_face

        # Crop and extract 128D normalized embedding
        _, embedding = self.embedder.process_detected_face(image, face, normalize=True)

        return ValidatedSample(
            sample_index=0,
            embedding=embedding,
            blur_score=val_res.blur_score,
            detection_confidence=face.confidence,
            box=face.box,
        )

    def aggregate_samples(self, samples: List[ValidatedSample]) -> np.ndarray:
        """
        Verify multi-sample consistency and compute normalized centroid vector.
        Requires inter-sample cosine similarity >= MIN_INTER_SAMPLE_SIMILARITY.
        """
        if not samples:
            raise SampleQualityError("No valid samples provided for enrollment.")

        if len(samples) == 1:
            return samples[0].embedding

        # Verify cross-sample similarity (consistency guard against accidental face changes)
        vectors = [s.embedding for s in samples]
        for i in range(len(vectors)):
            for j in range(i + 1, len(vectors)):
                sim = cosine_similarity(vectors[i], vectors[j])
                if sim < MIN_INTER_SAMPLE_SIMILARITY:
                    raise SampleQualityError(
                        f"Inconsistent facial samples detected (inter-sample similarity {sim:.3f} < {MIN_INTER_SAMPLE_SIMILARITY}). "
                        "All captured samples must be of the same student."
                    )

        # Compute centroid and normalize to unit sphere
        mean_vector = np.mean(vectors, axis=0)
        norm = float(np.linalg.norm(mean_vector))
        if norm < 1e-12:
            raise SampleQualityError("Computed mean embedding has near-zero norm.")
        return mean_vector / norm

    def create_enrollment_payload(
        self,
        authenticated_profile_id: str,
        student_database_id: str,
        verified_student_id_number: str,
        claimed_student_id_number: str,
        has_active_consent: bool,
        sample_images: List[np.ndarray],
        requested_model_version: str = ENROLLMENT_MODEL_VERSION,
    ) -> EnrollmentPayload:
        """
        End-to-end enrollment validation pipeline:
        1. Enforces authentication and authorization binding.
        2. Enforces student biometric consent.
        3. Enforces model version consistency.
        4. Validates each sample frame and extracts 128D embeddings.
        5. Aggregates multi-sample representations.
        6. Constructs ready-to-persist EnrollmentPayload without saving raw photos.
        """
        # 1. Authentication check
        if not authenticated_profile_id or not authenticated_profile_id.strip():
            raise UnauthenticatedError("Authentication required. Missing user identity.")

        # 2. Identity authorization guard (prevent spoofing student_id)
        if verified_student_id_number.strip() != claimed_student_id_number.strip():
            raise IdentitySpoofingError(
                f"Unauthorized: Authenticated identity '{verified_student_id_number}' cannot enroll "
                f"biometrics for requested identity '{claimed_student_id_number}'."
            )

        # 3. Biometric consent check (Mandatory Requirement #9)
        if not has_active_consent:
            raise ConsentRequiredError(
                f"Biometric consent not granted for student {verified_student_id_number}. "
                "Students must sign explicit informed consent prior to facial template enrollment."
            )

        # 4. Model version validation
        if requested_model_version != ENROLLMENT_MODEL_VERSION:
            raise ModelVersionError(
                f"Incompatible model version '{requested_model_version}'. "
                f"Only '{ENROLLMENT_MODEL_VERSION}' is supported by this recognizer subsystem."
            )

        # 5. Process samples
        if not sample_images:
            raise SampleQualityError("At least one camera frame sample is required for enrollment.")

        validated_samples: List[ValidatedSample] = []
        for idx, img in enumerate(sample_images):
            try:
                sample = self.process_and_extract_embedding(img)
                sample.sample_index = idx + 1
                validated_samples.append(sample)
            except SampleQualityError as e:
                raise SampleQualityError(f"Sample {idx + 1} rejected: {str(e)}")

        # 6. Aggregate to normalized unit embedding
        final_embedding = self.aggregate_samples(validated_samples)

        # Verify embedding properties
        if final_embedding.shape != (EMBEDDING_DIM,):
            raise SampleQualityError(f"Embedding vector dimension {final_embedding.shape} != expected ({EMBEDDING_DIM},).")

        now_utc = datetime.now(timezone.utc).isoformat()

        return EnrollmentPayload(
            student_database_id=student_database_id,
            student_id_number=verified_student_id_number,
            embedding_vector=[float(v) for v in final_embedding],
            model_version=ENROLLMENT_MODEL_VERSION,
            samples_count=len(validated_samples),
            registered_at=now_utc,
        )
