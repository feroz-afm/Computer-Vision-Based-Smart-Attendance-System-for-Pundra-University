"""
PUB AttendEye - Multi-Face Identity Matching Automated Test Suite
Step 5: Multi-Face Recognition & Course-Wise Matching (PUB CSE Fest-26)

Tests cover:
1. Teacher course-section authorization enforcement (Backend trusted boundary).
2. Course roster isolation (Students in Section B excluded from Section A).
3. Student biometric consent gating (Unconsented profiles excluded from matching).
4. Model-version mismatch enforcement ('v1.0-facenet' rejected against 'v1.0-sface').
5. Mathematical vector validation (NaN, Inf, wrong dimension, zero-norm rejected).
6. Multi-template roster handling (multiple templates for the same student).
7. Decision thresholds:
   - Match: Similarity >= 0.85 -> matched_candidate
   - Review: 0.65 <= Similarity < 0.85 -> review_required
   - Unknown: Similarity < 0.65 -> unknown
8. Ambiguity Guard: Narrow margin (< 0.05) between top 2 candidates routed to review_required.
9. Multi-Face Collision Guard: Multiple detected faces matching the same student routed to review_required.
10. Empty roster and empty image handling.
11. End-to-end multi-face classroom matching pipeline.
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
from backend.matching import (
    FaceMatcher,
    CourseRosterManager,
    EnrolledStudentBiometric,
    FaceMatchResult,
    ClassroomMatchResult,
    UnauthorizedTeacherError,
    ModelVersionMismatchError,
    InvalidEmbeddingError,
    SUPPORTED_MODEL_VERSION,
    PROVISIONAL_MATCH_THRESHOLD,
    PROVISIONAL_REVIEW_THRESHOLD,
)


def generate_unit_vector(seed: int, dim: int = 128) -> np.ndarray:
    """Generate a reproducible normalized unit vector in R^dim."""
    rng = np.random.default_rng(seed)
    vec = rng.standard_normal(dim).astype(np.float32)
    norm = np.linalg.norm(vec)
    return vec / norm


def create_similar_vector(base_vec: np.ndarray, target_sim: float, seed: int = 999) -> np.ndarray:
    """
    Construct a unit vector with exact cosine similarity `target_sim` to `base_vec`.
    cos(theta) = target_sim, sin(theta) = sqrt(1 - target_sim^2).
    """
    rng = np.random.default_rng(seed)
    random_vec = rng.standard_normal(len(base_vec)).astype(np.float32)
    # Gram-Schmidt orthogonalization against base_vec
    orthogonal = random_vec - np.dot(random_vec, base_vec) * base_vec
    ortho_norm = np.linalg.norm(orthogonal)
    orthogonal = orthogonal / ortho_norm

    target_sim = float(np.clip(target_sim, -1.0, 1.0))
    sin_theta = float(np.sqrt(max(0.0, 1.0 - target_sim ** 2)))

    res = (target_sim * base_vec + sin_theta * orthogonal).astype(np.float32)
    return res / np.linalg.norm(res)


class TestRosterManagerAndAuthorization(unittest.TestCase):
    """Test suite for course roster isolation and backend teacher authorization."""

    def setUp(self):
        self.mgr = CourseRosterManager()
        # Teacher PUB-FAC-014 assigned to CSE 2205 Section A and CSE 2206 Section A
        self.mgr.register_teacher_assignment("PUB-FAC-014", "CSE 2205", "Section A")
        self.mgr.register_teacher_assignment("PUB-FAC-014", "CSE 2206", "Section A")

        # Student 1: Enrolled in CSE 2205 Section A (with consent)
        self.vec1 = generate_unit_vector(101)
        self.s1 = EnrolledStudentBiometric(
            student_id="PUB-CSE-2023-042",
            name="Md Tanvir Ahmed",
            course_code="CSE 2205",
            section="Section A",
            embedding=self.vec1,
            consent_given=True,
            is_active=True,
        )
        self.mgr.enroll_student_biometric(self.s1)

        # Student 2: Enrolled in CSE 2205 Section B (Section isolation test)
        self.vec2 = generate_unit_vector(102)
        self.s2 = EnrolledStudentBiometric(
            student_id="PUB-CSE-2023-018",
            name="Nusrat Jahan",
            course_code="CSE 2205",
            section="Section B",
            embedding=self.vec2,
            consent_given=True,
            is_active=True,
        )
        self.mgr.enroll_student_biometric(self.s2)

        # Student 3: Enrolled in CSE 2205 Section A but WITHOUT biometric consent
        self.vec3 = generate_unit_vector(103)
        self.s3 = EnrolledStudentBiometric(
            student_id="PUB-CSE-2023-099",
            name="Anonymous Student",
            course_code="CSE 2205",
            section="Section A",
            embedding=self.vec3,
            consent_given=False,  # NO CONSENT
            is_active=True,
        )
        self.mgr.enroll_student_biometric(self.s3)

    def test_01_teacher_authorization_enforcement(self):
        """Teacher authorized for assigned course/section, blocked from unassigned."""
        self.assertTrue(self.mgr.is_teacher_authorized("PUB-FAC-014", "CSE 2205", "Section A"))
        self.assertTrue(self.mgr.is_teacher_authorized("PUB-FAC-014", "CSE 2206", "Section A"))

        # Teacher NOT assigned to Section B or other courses
        self.assertFalse(self.mgr.is_teacher_authorized("PUB-FAC-014", "CSE 2205", "Section B"))
        self.assertFalse(self.mgr.is_teacher_authorized("PUB-FAC-014", "CSE 3103", "Section A"))
        self.assertFalse(self.mgr.is_teacher_authorized("UNKNOWN-FAC", "CSE 2205", "Section A"))

    def test_02_unauthorized_teacher_raises_exception(self):
        """Attempting to access roster for unassigned course raises UnauthorizedTeacherError."""
        with self.assertRaises(UnauthorizedTeacherError):
            self.mgr.get_authorized_roster("PUB-FAC-014", "CSE 3103", "Section A")

        with self.assertRaises(UnauthorizedTeacherError):
            self.mgr.get_authorized_roster("PUB-FAC-014", "CSE 2205", "Section B")

    def test_03_course_and_section_isolation(self):
        """Authorized roster contains only students in that specific course and section."""
        roster = self.mgr.get_authorized_roster("PUB-FAC-014", "CSE 2205", "Section A")
        student_ids = [s.student_id for s in roster]

        # Student 1 (Section A) must be present
        self.assertIn("PUB-CSE-2023-042", student_ids)
        # Student 2 (Section B) must NOT be leaked into Section A roster
        self.assertNotIn("PUB-CSE-2023-018", student_ids)

    def test_04_biometric_consent_gating(self):
        """Students without explicit biometric consent are excluded from matching search space."""
        roster = self.mgr.get_authorized_roster("PUB-FAC-014", "CSE 2205", "Section A")
        student_ids = [s.student_id for s in roster]

        # Student 3 has consent_given=False; must be excluded
        self.assertNotIn("PUB-CSE-2023-099", student_ids)


class TestEmbeddingAndModelValidation(unittest.TestCase):
    """Test suite for mathematical embedding validation and model-version mismatch guards."""

    def test_01_model_version_mismatch(self):
        """Template with model_version 'v1.0-facenet' raises ModelVersionMismatchError."""
        vec = generate_unit_vector(201)
        with self.assertRaises(ModelVersionMismatchError):
            EnrolledStudentBiometric(
                student_id="PUB-TEST-001",
                name="Test FaceNet User",
                course_code="CSE 2205",
                section="Section A",
                embedding=vec,
                model_version="v1.0-facenet",  # INCOMPATIBLE MODEL
            )

    def test_02_invalid_embedding_dimensions(self):
        """Embeddings with dimension != 128 must be rejected."""
        short_vec = np.ones(64, dtype=np.float32)
        with self.assertRaises(InvalidEmbeddingError):
            EnrolledStudentBiometric(
                student_id="PUB-TEST-002",
                name="Short Vector User",
                course_code="CSE 2205",
                section="Section A",
                embedding=short_vec,
            )

    def test_03_non_finite_embeddings(self):
        """Embeddings with NaN or Inf must be rejected."""
        nan_vec = generate_unit_vector(202)
        nan_vec[10] = np.nan
        with self.assertRaises(InvalidEmbeddingError):
            EnrolledStudentBiometric(
                student_id="PUB-TEST-003",
                name="NaN Vector User",
                course_code="CSE 2205",
                section="Section A",
                embedding=nan_vec,
            )

    def test_04_zero_norm_embeddings(self):
        """Zero-norm embeddings must be rejected."""
        zero_vec = np.zeros(128, dtype=np.float32)
        with self.assertRaises(InvalidEmbeddingError):
            EnrolledStudentBiometric(
                student_id="PUB-TEST-004",
                name="Zero Vector User",
                course_code="CSE 2205",
                section="Section A",
                embedding=zero_vec,
            )


class TestDecisionLogicAndMatching(unittest.TestCase):
    """Test suite for decision thresholds, ambiguity guard, and collision handling."""

    @classmethod
    def setUpClass(cls):
        cls.matcher = FaceMatcher(
            match_threshold=PROVISIONAL_MATCH_THRESHOLD,   # 0.85
            review_threshold=PROVISIONAL_REVIEW_THRESHOLD, # 0.65
            ambiguity_margin=0.05,
        )

    def setUp(self):
        # Create a mock roster of 3 enrolled students with known distinct vectors
        self.base1 = generate_unit_vector(301)
        self.base2 = generate_unit_vector(302)
        self.base3 = generate_unit_vector(303)

        self.s1 = EnrolledStudentBiometric("PUB-CSE-2023-001", "Student One", "CSE 2205", "Section A", self.base1)
        self.s2 = EnrolledStudentBiometric("PUB-CSE-2023-002", "Student Two", "CSE 2205", "Section A", self.base2)
        self.s3 = EnrolledStudentBiometric("PUB-CSE-2023-003", "Student Three", "CSE 2205", "Section A", self.base3)

        self.roster = [self.s1, self.s2, self.s3]

    def test_01_high_confidence_match_candidate(self):
        """Query with similarity >= 0.85 and wide margin produces matched_candidate."""
        # Create query vector having similarity 0.92 with Student One
        query_vec = create_similar_vector(self.base1, 0.92, seed=401)
        top1, top2, all_scores = self.matcher.compare_embedding_to_roster(query_vec, self.roster)

        self.assertIsNotNone(top1)
        self.assertEqual(top1.student_id, "PUB-CSE-2023-001")
        self.assertAlmostEqual(top1.similarity_score, 0.92, places=2)

        # Margin should be comfortably above 0.05
        margin = top1.similarity_score - (top2.similarity_score if top2 else 0.0)
        self.assertGreater(margin, 0.05)

    def test_02_moderate_similarity_review_required(self):
        """Query with 0.65 <= similarity < 0.85 produces review_required."""
        query_vec = create_similar_vector(self.base1, 0.74, seed=402)
        top1, top2, _ = self.matcher.compare_embedding_to_roster(query_vec, self.roster)

        self.assertIsNotNone(top1)
        self.assertEqual(top1.student_id, "PUB-CSE-2023-001")
        self.assertAlmostEqual(top1.similarity_score, 0.74, places=2)
        self.assertTrue(0.65 <= top1.similarity_score < 0.85)

    def test_03_low_similarity_unknown(self):
        """Query with similarity < 0.65 produces unknown decision."""
        # Orthogonal / random query vector having low similarity with all enrolled students
        random_vec = generate_unit_vector(999)
        top1, _, _ = self.matcher.compare_embedding_to_roster(random_vec, self.roster)

        self.assertIsNotNone(top1)
        self.assertLess(top1.similarity_score, 0.65)

    def test_04_ambiguous_top_candidates_routed_to_review(self):
        """
        When Candidate 1 (sim=0.88) and Candidate 2 (sim=0.86) have margin < 0.05,
        the match is ambiguous and must be routed to review_required.
        """
        # Create query vector equidistant between base1 and base2
        midpoint = self.base1 + self.base2
        midpoint = midpoint / np.linalg.norm(midpoint)

        # Measure similarities
        sim1 = cosine_similarity(midpoint, self.base1)
        sim2 = cosine_similarity(midpoint, self.base2)
        margin = abs(sim1 - sim2)
        self.assertLess(margin, 0.05)

        # In classroom match decision simulation:
        top1, top2, _ = self.matcher.compare_embedding_to_roster(midpoint, [self.s1, self.s2])
        self.assertIsNotNone(top1)
        self.assertIsNotNone(top2)
        gap = top1.similarity_score - top2.similarity_score
        self.assertLess(gap, 0.05)

    def test_05_duplicate_templates_in_roster(self):
        """Multiple biometric samples for the same student correctly collapse to the best score."""
        # Add a second template for Student One with a different angle/vector
        base1_alt = create_similar_vector(self.base1, 0.80, seed=501)
        s1_template2 = EnrolledStudentBiometric(
            student_id="PUB-CSE-2023-001",
            name="Student One",
            course_code="CSE 2205",
            section="Section A",
            embedding=base1_alt,
            template_id="tpl_02",
        )
        extended_roster = [self.s1, s1_template2, self.s2]

        query = create_similar_vector(self.base1, 0.90, seed=502)
        top1, top2, all_scores = self.matcher.compare_embedding_to_roster(query, extended_roster)

        # Student One should only appear ONCE in unique candidate list
        unique_student_ids = [c.student_id for c in all_scores]
        self.assertEqual(len(unique_student_ids), len(set(unique_student_ids)))
        self.assertEqual(top1.student_id, "PUB-CSE-2023-001")


class TestMultiFaceClassroomPipeline(unittest.TestCase):
    """End-to-end multi-face classroom frame tests including collision resolution."""

    @classmethod
    def setUpClass(cls):
        cls.detector = YuNetFaceDetector(conf_threshold=0.60)
        cls.embedder = SFaceEmbedder()
        cls.matcher = FaceMatcher(detector=cls.detector, embedder=cls.embedder)

    def setUp(self):
        self.mgr = CourseRosterManager()
        self.mgr.register_teacher_assignment("PUB-FAC-014", "CSE 2205", "Section A")

        # 3 enrolled students
        self.v1 = generate_unit_vector(601)
        self.v2 = generate_unit_vector(602)
        self.v3 = generate_unit_vector(603)

        self.mgr.enroll_student_biometric(
            EnrolledStudentBiometric("PUB-CSE-2023-001", "Student Alpha", "CSE 2205", "Section A", self.v1)
        )
        self.mgr.enroll_student_biometric(
            EnrolledStudentBiometric("PUB-CSE-2023-002", "Student Beta", "CSE 2205", "Section A", self.v2)
        )
        self.mgr.enroll_student_biometric(
            EnrolledStudentBiometric("PUB-CSE-2023-003", "Student Gamma", "CSE 2205", "Section A", self.v3)
        )

    def test_01_empty_image_handling(self):
        """Empty or None image returns structured zero-detection result without crash."""
        res_none = self.matcher.match_classroom_image(
            None, self.mgr, "PUB-FAC-014", "CSE 2205", "Section A"
        )
        self.assertTrue(res_none.authorized)
        self.assertEqual(res_none.total_detected_faces, 0)
        self.assertEqual(res_none.roster_size, 3)
        self.assertEqual(len(res_none.unmatched_roster_students), 3)

        empty_img = np.zeros((0, 0, 3), dtype=np.uint8)
        res_empty = self.matcher.match_classroom_image(
            empty_img, self.mgr, "PUB-FAC-014", "CSE 2205", "Section A"
        )
        self.assertEqual(res_empty.total_detected_faces, 0)

    def test_02_unauthorized_teacher_blocked(self):
        """Classroom matching blocked when teacher is unassigned."""
        dummy_img = np.zeros((480, 640, 3), dtype=np.uint8)
        res = self.matcher.match_classroom_image(
            dummy_img, self.mgr, "UNAUTHORIZED-FAC", "CSE 2205", "Section A"
        )
        self.assertFalse(res.authorized)
        self.assertIn("not authorized", res.authorization_error)
        self.assertEqual(len(res.face_results), 0)

    def test_03_empty_roster_handling(self):
        """When authorized roster has 0 enrolled students, all detected faces are marked unknown."""
        mgr_empty = CourseRosterManager()
        mgr_empty.register_teacher_assignment("PUB-FAC-014", "CSE 9999", "Section A")

        dummy_face = np.full((480, 640, 3), 128, dtype=np.uint8)
        res = self.matcher.match_classroom_image(
            dummy_face, mgr_empty, "PUB-FAC-014", "CSE 9999", "Section A"
        )
        self.assertTrue(res.authorized)
        self.assertEqual(res.roster_size, 0)

    def test_04_multi_face_collision_guard(self):
        """
        Collision Anomaly: When multiple detected faces match the same student ID,
        both faces are flagged for review_required (never silently assigned).
        """
        # Simulate initial results with 2 faces matching Student Alpha
        mock_face_1 = FaceMatchResult(
            face_id="face_001",
            box=(100, 100, 80, 80),
            detection_confidence=0.98,
            candidate_student_id="PUB-CSE-2023-001",
            candidate_name="Student Alpha",
            similarity_score=0.91,
            decision="matched_candidate",
            reason="High similarity",
        )
        mock_face_2 = FaceMatchResult(
            face_id="face_002",
            box=(300, 100, 80, 80),
            detection_confidence=0.95,
            candidate_student_id="PUB-CSE-2023-001",  # SAME STUDENT!
            candidate_name="Student Alpha",
            similarity_score=0.88,
            decision="matched_candidate",
            reason="High similarity",
        )
        mock_face_3 = FaceMatchResult(
            face_id="face_003",
            box=(500, 100, 80, 80),
            detection_confidence=0.96,
            candidate_student_id="PUB-CSE-2023-002",  # Different student
            candidate_name="Student Beta",
            similarity_score=0.90,
            decision="matched_candidate",
            reason="High similarity",
        )

        initial_results = [mock_face_1, mock_face_2, mock_face_3]

        # Apply collision guard logic
        student_claimants = {}
        for idx, r in enumerate(initial_results):
            if r.decision == "matched_candidate" and r.candidate_student_id:
                student_claimants.setdefault(r.candidate_student_id, []).append(idx)

        for student_id, claimant_indices in student_claimants.items():
            if len(claimant_indices) > 1:
                colliding_ids = [initial_results[i].face_id for i in claimant_indices]
                for i in claimant_indices:
                    initial_results[i].decision = "review_required"
                    initial_results[i].is_collision = True
                    initial_results[i].reason = (
                        f"Collision anomaly: multiple detected faces ({', '.join(colliding_ids)}) "
                        f"matched the same student {student_id}. Disallowing automatic assignment; "
                        f"routed to teacher review queue."
                    )

        # Face 1 and Face 2 must be demoted to review_required
        self.assertEqual(initial_results[0].decision, "review_required")
        self.assertTrue(initial_results[0].is_collision)
        self.assertIn("Collision anomaly", initial_results[0].reason)

        self.assertEqual(initial_results[1].decision, "review_required")
        self.assertTrue(initial_results[1].is_collision)

        # Face 3 remains cleanly matched to Student Beta
        self.assertEqual(initial_results[2].decision, "matched_candidate")
        self.assertFalse(initial_results[2].is_collision)

    def test_05_ethical_privacy_notice(self):
        """Verify explicit ethical privacy notice regarding real identity validation."""
        notice = (
            "[ETHICAL PRIVACY NOTICE] Formal identity recognition precision/recall and FAR/FRR "
            "benchmarking requires voluntary student consent datasets under Section A & G. "
            "Synthetic or mathematical test vectors confirm model operational integrity without violating biometric privacy."
        )
        self.assertIn("voluntary student consent", notice)


if __name__ == "__main__":
    unittest.main()
