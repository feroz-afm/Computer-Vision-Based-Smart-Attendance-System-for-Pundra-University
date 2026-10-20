"""
PUB AttendEye - Multi-Face Identity Matching & Course-Wise Scoping Subsystem
Step 5: Multi-Face Recognition & Course-Wise Matching (PUB CSE Fest-26)

This module implements genuine multi-face identity matching against enrolled
student biometric templates, strictly scoped to the teacher's authorized course
and section roster.

Key Invariants:
1. Multi-Face Extraction: Uses YuNet for detection and SFace for 128D embeddings.
2. Cosine Similarity: Normalized vector dot product in [-1.0, 1.0].
3. Provisional Decision Thresholds:
   - >= 0.85: matched_candidate (subject to ambiguity and collision guards)
   - >= 0.65 and < 0.85: review_required
   - < 0.65: unknown
4. Ambiguity Guard: If top score >= 0.85 but (score_top1 - score_top2) < ambiguity_margin,
   decision is routed to review_required.
5. Multi-Face Collision Guard: If multiple detected faces match the same student,
   all colliding faces are flagged for review_required (never silently assigned).
6. Model-Version Enforcement: Enrollment and recognition must both use 'v1.0-sface'.
   Cross-model comparison (e.g. with 'v1.0-facenet') is strictly rejected.
7. Authorization & Course Isolation: Only students actively enrolled in the specific
   course and section are searched. Teacher must be authorized for that course/section.
8. No Attendance Writes: This milestone does NOT write or modify attendance records.
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple, Union
import numpy as np

from backend.detector import DetectedFace, YuNetFaceDetector
from backend.recognizer import SFaceEmbedder, cosine_similarity

logger = logging.getLogger("matching")

# Supported Biometric Model Version
SUPPORTED_MODEL_VERSION = "v1.0-sface"
EMBEDDING_DIMENSION = 128

# Provisional Decision Thresholds (Similarity values, not probabilities)
PROVISIONAL_MATCH_THRESHOLD = 0.85
PROVISIONAL_REVIEW_THRESHOLD = 0.65
DEFAULT_AMBIGUITY_MARGIN = 0.05  # Margin between top 2 candidates


class MatchingError(Exception):
    """Base exception for matching operations."""
    pass


class UnauthorizedTeacherError(MatchingError):
    """Raised when a teacher attempts to take attendance for an unassigned course/section."""
    pass


class ModelVersionMismatchError(MatchingError):
    """Raised when an enrolled template model version does not match recognizer."""
    pass


class InvalidEmbeddingError(MatchingError):
    """Raised when an embedding is malformed, has incorrect dimension, or non-finite values."""
    pass


@dataclass
class EnrolledStudentBiometric:
    """Represents an enrolled student's stored biometric profile."""
    student_id: str             # e.g., "PUB-CSE-2023-042"
    name: str                   # e.g., "Md Tanvir Ahmed"
    course_code: str            # e.g., "CSE 2205"
    section: str                # e.g., "Section A"
    embedding: np.ndarray       # 128D float32 normalized vector
    model_version: str = SUPPORTED_MODEL_VERSION
    consent_given: bool = True
    is_active: bool = True
    template_id: Optional[str] = None

    def __post_init__(self):
        # Convert embedding to numpy array and validate
        if self.embedding is None:
            raise InvalidEmbeddingError(f"Embedding for student {self.student_id} is None.")
        self.embedding = np.asarray(self.embedding, dtype=np.float32).ravel()

        if self.embedding.size != EMBEDDING_DIMENSION:
            raise InvalidEmbeddingError(
                f"Student {self.student_id} embedding has dimension {self.embedding.size}, expected {EMBEDDING_DIMENSION}."
            )

        if not np.isfinite(self.embedding).all():
            raise InvalidEmbeddingError(
                f"Student {self.student_id} embedding contains non-finite values (NaN/Inf)."
            )

        norm = float(np.linalg.norm(self.embedding))
        if norm < 1e-12:
            raise InvalidEmbeddingError(f"Student {self.student_id} embedding has near-zero norm.")

        # Ensure unit normalization
        if abs(norm - 1.0) > 1e-3:
            self.embedding = self.embedding / norm

        # Model version validation
        if self.model_version != SUPPORTED_MODEL_VERSION:
            raise ModelVersionMismatchError(
                f"Enrolled template model version '{self.model_version}' does not match active recognizer '{SUPPORTED_MODEL_VERSION}'."
            )


@dataclass
class CandidateScore:
    """Candidate match details from roster comparison."""
    student_id: str
    name: str
    similarity_score: float
    template_id: Optional[str] = None


@dataclass
class FaceMatchResult:
    """Individual face recognition and decision result."""
    face_id: str
    box: Tuple[int, int, int, int]  # (x, y, w, h)
    detection_confidence: float
    candidate_student_id: Optional[str] = None
    candidate_name: Optional[str] = None
    similarity_score: float = 0.0
    decision: str = "unknown"  # 'matched_candidate' | 'review_required' | 'unknown'
    reason: str = ""
    top_candidates: List[Dict[str, Any]] = field(default_factory=list)
    score_margin: Optional[float] = None
    is_collision: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "face_id": self.face_id,
            "box": {
                "x": self.box[0],
                "y": self.box[1],
                "w": self.box[2],
                "h": self.box[3],
            },
            "detection_confidence": self.detection_confidence,
            "candidate_student_id": self.candidate_student_id,
            "candidate_name": self.candidate_name,
            "similarity_score": round(self.similarity_score, 4),
            "decision": self.decision,
            "reason": self.reason,
            "score_margin": round(self.score_margin, 4) if self.score_margin is not None else None,
            "is_collision": self.is_collision,
            "top_candidates": self.top_candidates,
        }


@dataclass
class ClassroomMatchResult:
    """Aggregated match results for a classroom frame, scoped to course & section."""
    course_code: str
    section: str
    teacher_id: str
    authorized: bool
    total_detected_faces: int
    matched_candidates_count: int
    review_required_count: int
    unknown_count: int
    face_results: List[FaceMatchResult]
    roster_size: int
    unmatched_roster_students: List[str] = field(default_factory=list)
    authorization_error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "course_code": self.course_code,
            "section": self.section,
            "teacher_id": self.teacher_id,
            "authorized": self.authorized,
            "authorization_error": self.authorization_error,
            "roster_size": self.roster_size,
            "total_detected_faces": self.total_detected_faces,
            "matched_candidates_count": self.matched_candidates_count,
            "review_required_count": self.review_required_count,
            "unknown_count": self.unknown_count,
            "unmatched_roster_students": self.unmatched_roster_students,
            "face_results": [f.to_dict() for f in self.face_results],
        }


class CourseRosterManager:
    """
    Manages course enrollment relationships and teacher assignments.
    Enforces strict backend authorization boundaries without relying on frontend checks.
    """

    def __init__(self):
        # Teacher assignments: set of (teacher_id, course_code, section)
        self._teacher_assignments: Set[Tuple[str, str, str]] = set()
        # Enrolled biometrics: map of (course_code, section) -> List[EnrolledStudentBiometric]
        self._rosters: Dict[Tuple[str, str], List[EnrolledStudentBiometric]] = {}

    def register_teacher_assignment(self, teacher_id: str, course_code: str, section: str) -> None:
        """Register teacher authorization for a specific course and section."""
        self._teacher_assignments.add((teacher_id.strip(), course_code.strip(), section.strip()))

    def enroll_student_biometric(self, student: EnrolledStudentBiometric) -> None:
        """Enroll a student biometric template into a specific course & section roster."""
        key = (student.course_code.strip(), student.section.strip())
        if key not in self._rosters:
            self._rosters[key] = []
        self._rosters[key].append(student)

    def is_teacher_authorized(self, teacher_id: str, course_code: str, section: str) -> bool:
        """Check if teacher is explicitly authorized for this course and section."""
        return (teacher_id.strip(), course_code.strip(), section.strip()) in self._teacher_assignments

    def get_authorized_roster(
        self,
        teacher_id: str,
        course_code: str,
        section: str,
    ) -> List[EnrolledStudentBiometric]:
        """
        Retrieve authorized student biometrics for the course and section.
        Raises UnauthorizedTeacherError if the teacher is not assigned.
        Filters out students without explicit consent or inactive accounts.
        """
        if not self.is_teacher_authorized(teacher_id, course_code, section):
            raise UnauthorizedTeacherError(
                f"Teacher '{teacher_id}' is not authorized to access roster for course '{course_code}', section '{section}'."
            )

        key = (course_code.strip(), section.strip())
        raw_list = self._rosters.get(key, [])

        # Filter strictly for active students who provided consent
        authorized = [s for s in raw_list if s.is_active and s.consent_given]
        return authorized


class FaceMatcher:
    """
    Multi-face matcher using YuNet detector and SFace recognizer.
    Compares detected face embeddings against an authorized course roster.
    """

    def __init__(
        self,
        detector: Optional[YuNetFaceDetector] = None,
        embedder: Optional[SFaceEmbedder] = None,
        match_threshold: float = PROVISIONAL_MATCH_THRESHOLD,
        review_threshold: float = PROVISIONAL_REVIEW_THRESHOLD,
        ambiguity_margin: float = DEFAULT_AMBIGUITY_MARGIN,
    ):
        self.detector = detector or YuNetFaceDetector()
        self.embedder = embedder or SFaceEmbedder()
        self.match_threshold = match_threshold
        self.review_threshold = review_threshold
        self.ambiguity_margin = ambiguity_margin

    def compare_embedding_to_roster(
        self,
        query_embedding: np.ndarray,
        roster: List[EnrolledStudentBiometric],
    ) -> Tuple[Optional[CandidateScore], Optional[CandidateScore], List[CandidateScore]]:
        """
        Compute cosine similarity between query embedding and all enrolled students in the roster.
        Handles duplicate templates per student by selecting the best similarity for each unique student.
        Returns: (top_candidate, second_candidate, all_unique_student_scores_sorted)
        """
        if not roster or query_embedding is None:
            return None, None, []

        # Map student_id -> best CandidateScore (handles multiple templates per student)
        student_best_scores: Dict[str, CandidateScore] = {}

        for student in roster:
            # Model-version guard
            if student.model_version != self.embedder.MODEL_NAME:
                logger.warning(
                    f"Skipping student {student.student_id}: template version {student.model_version} != recognizer {self.embedder.MODEL_NAME}"
                )
                continue

            sim = cosine_similarity(query_embedding, student.embedding)

            current_best = student_best_scores.get(student.student_id)
            if current_best is None or sim > current_best.similarity_score:
                student_best_scores[student.student_id] = CandidateScore(
                    student_id=student.student_id,
                    name=student.name,
                    similarity_score=float(sim),
                    template_id=student.template_id,
                )

        if not student_best_scores:
            return None, None, []

        # Sort candidate scores descending by similarity
        sorted_candidates = sorted(
            student_best_scores.values(),
            key=lambda c: c.similarity_score,
            reverse=True,
        )

        top1 = sorted_candidates[0]
        top2 = sorted_candidates[1] if len(sorted_candidates) > 1 else None

        return top1, top2, sorted_candidates

    def match_classroom_image(
        self,
        image: np.ndarray,
        roster_manager: CourseRosterManager,
        teacher_id: str,
        course_code: str,
        section: str,
    ) -> ClassroomMatchResult:
        """
        Process a classroom image:
        1. Validates teacher authorization and extracts scoped roster.
        2. Detects all faces in the frame using YuNet.
        3. Aligns and extracts 128D SFace embeddings for each face.
        4. Compares each face against the scoped roster.
        5. Applies decision thresholds, ambiguity margin guards, and collision checks.
        6. Returns structured ClassroomMatchResult without writing attendance.
        """
        # Step 1: Authorization check
        try:
            authorized_roster = roster_manager.get_authorized_roster(teacher_id, course_code, section)
        except UnauthorizedTeacherError as err:
            return ClassroomMatchResult(
                course_code=course_code,
                section=section,
                teacher_id=teacher_id,
                authorized=False,
                authorization_error=str(err),
                total_detected_faces=0,
                matched_candidates_count=0,
                review_required_count=0,
                unknown_count=0,
                face_results=[],
                roster_size=0,
                unmatched_roster_students=[],
            )

        # Step 2: Input image validation
        if image is None or image.size == 0:
            return ClassroomMatchResult(
                course_code=course_code,
                section=section,
                teacher_id=teacher_id,
                authorized=True,
                total_detected_faces=0,
                matched_candidates_count=0,
                review_required_count=0,
                unknown_count=0,
                face_results=[],
                roster_size=len(authorized_roster),
                unmatched_roster_students=[s.student_id for s in authorized_roster],
            )

        # Step 3: Face detection
        detected_faces = self.detector.detect(image)
        if not detected_faces:
            return ClassroomMatchResult(
                course_code=course_code,
                section=section,
                teacher_id=teacher_id,
                authorized=True,
                total_detected_faces=0,
                matched_candidates_count=0,
                review_required_count=0,
                unknown_count=0,
                face_results=[],
                roster_size=len(authorized_roster),
                unmatched_roster_students=[s.student_id for s in authorized_roster],
            )

        # Handle empty roster scenario
        if not authorized_roster:
            face_results = []
            for face in detected_faces:
                face_results.append(
                    FaceMatchResult(
                        face_id=face.face_id,
                        box=face.box,
                        detection_confidence=face.confidence,
                        candidate_student_id=None,
                        candidate_name=None,
                        similarity_score=0.0,
                        decision="unknown",
                        reason="Authorized course roster is empty; no candidates to compare.",
                    )
                )
            return ClassroomMatchResult(
                course_code=course_code,
                section=section,
                teacher_id=teacher_id,
                authorized=True,
                total_detected_faces=len(detected_faces),
                matched_candidates_count=0,
                review_required_count=0,
                unknown_count=len(face_results),
                face_results=face_results,
                roster_size=0,
                unmatched_roster_students=[],
            )

        # Step 4: Extract embeddings and compare with roster
        initial_results: List[FaceMatchResult] = []

        for face in detected_faces:
            try:
                aligned_crop, query_embedding = self.embedder.process_detected_face(image, face, normalize=True)
            except Exception as e:
                initial_results.append(
                    FaceMatchResult(
                        face_id=face.face_id,
                        box=face.box,
                        detection_confidence=face.confidence,
                        candidate_student_id=None,
                        candidate_name=None,
                        similarity_score=0.0,
                        decision="unknown",
                        reason=f"Face alignment or embedding extraction failed: {str(e)}",
                    )
                )
                continue

            # Compare embedding against authorized roster
            top1, top2, all_scores = self.compare_embedding_to_roster(query_embedding, authorized_roster)

            if top1 is None:
                initial_results.append(
                    FaceMatchResult(
                        face_id=face.face_id,
                        box=face.box,
                        detection_confidence=face.confidence,
                        candidate_student_id=None,
                        candidate_name=None,
                        similarity_score=0.0,
                        decision="unknown",
                        reason="No valid candidate scores could be evaluated against the roster.",
                    )
                )
                continue

            top_candidates_summary = [
                {"student_id": c.student_id, "name": c.name, "similarity": round(c.similarity_score, 4)}
                for c in all_scores[:3]
            ]

            score = top1.similarity_score
            margin = (score - top2.similarity_score) if top2 is not None else None

            # Provisional decision logic
            if score >= self.match_threshold:
                # Ambiguity check: if difference between top1 and top2 is too narrow
                if margin is not None and margin < self.ambiguity_margin:
                    decision = "review_required"
                    reason = (
                        f"Ambiguous top match: score {score:.3f} exceeds threshold ({self.match_threshold}), "
                        f"but margin over second candidate ({top2.student_id}: {top2.similarity_score:.3f}) "
                        f"is {margin:.3f} < margin guard ({self.ambiguity_margin}). Requires teacher review."
                    )
                else:
                    decision = "matched_candidate"
                    reason = (
                        f"High similarity candidate {top1.student_id} (score: {score:.3f} >= threshold {self.match_threshold})"
                    )
            elif score >= self.review_threshold:
                decision = "review_required"
                reason = (
                    f"Moderate similarity candidate {top1.student_id} (score: {score:.3f} in review band "
                    f"[{self.review_threshold}, {self.match_threshold})). Requires teacher confirmation."
                )
            else:
                decision = "unknown"
                reason = (
                    f"Low similarity (best score {score:.3f} < threshold {self.review_threshold}). "
                    f"Candidate not recognized in course roster."
                )

            initial_results.append(
                FaceMatchResult(
                    face_id=face.face_id,
                    box=face.box,
                    detection_confidence=face.confidence,
                    candidate_student_id=top1.student_id if decision != "unknown" else None,
                    candidate_name=top1.name if decision != "unknown" else None,
                    similarity_score=score,
                    decision=decision,
                    reason=reason,
                    top_candidates=top_candidates_summary,
                    score_margin=margin,
                )
            )

        # Step 5: Multi-Face Collision Guard (No duplicate student assignments)
        # If multiple detected faces claim the same candidate student ID, flag all colliding faces for review
        student_claimants: Dict[str, List[int]] = {}
        for idx, res in enumerate(initial_results):
            if res.decision == "matched_candidate" and res.candidate_student_id:
                student_claimants.setdefault(res.candidate_student_id, []).append(idx)

        for student_id, claimant_indices in student_claimants.items():
            if len(claimant_indices) > 1:
                colliding_face_ids = [initial_results[i].face_id for i in claimant_indices]
                for i in claimant_indices:
                    initial_results[i].decision = "review_required"
                    initial_results[i].is_collision = True
                    initial_results[i].reason = (
                        f"Collision anomaly: multiple detected faces ({', '.join(colliding_face_ids)}) "
                        f"matched the same student {student_id}. Disallowing automatic assignment; "
                        f"routed to teacher review queue."
                    )

        # Step 6: Tally counts and compute unmatched roster students
        matched_candidates_count = sum(1 for r in initial_results if r.decision == "matched_candidate")
        review_required_count = sum(1 for r in initial_results if r.decision == "review_required")
        unknown_count = sum(1 for r in initial_results if r.decision == "unknown")

        matched_student_ids = {
            r.candidate_student_id
            for r in initial_results
            if r.candidate_student_id and r.decision in ("matched_candidate", "review_required")
        }
        unmatched_roster = [
            s.student_id for s in authorized_roster if s.student_id not in matched_student_ids
        ]

        return ClassroomMatchResult(
            course_code=course_code,
            section=section,
            teacher_id=teacher_id,
            authorized=True,
            total_detected_faces=len(detected_faces),
            matched_candidates_count=matched_candidates_count,
            review_required_count=review_required_count,
            unknown_count=unknown_count,
            face_results=initial_results,
            roster_size=len(authorized_roster),
            unmatched_roster_students=unmatched_roster,
        )
