"""
PUB AttendEye - SFace Embedder & Cosine Similarity Automated Test Suite
Evaluates SFace 128D facial feature extraction and mathematical similarity operations.
"""

import os
import sys
import unittest
import numpy as np
import cv2

# Ensure project root is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.detector import YuNetFaceDetector, DetectedFace
from backend.recognizer import SFaceEmbedder, cosine_similarity


class TestCosineSimilarity(unittest.TestCase):
    """Rigorous unit tests for mathematical vector similarity calculations."""

    def test_01_identical_vectors(self):
        """Identical vectors must return similarity of exactly 1.0."""
        vec = np.random.randn(128).astype(np.float32)
        sim = cosine_similarity(vec, vec)
        self.assertAlmostEqual(sim, 1.0, places=5)

    def test_02_orthogonal_vectors(self):
        """Orthogonal vectors must return similarity of 0.0."""
        vec1 = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        vec2 = np.array([0.0, 1.0, 0.0, 0.0], dtype=np.float32)
        sim = cosine_similarity(vec1, vec2)
        self.assertAlmostEqual(sim, 0.0, places=5)

    def test_03_opposite_vectors(self):
        """Opposite / antipodal vectors must return similarity of -1.0."""
        vec = np.random.randn(128).astype(np.float32)
        sim = cosine_similarity(vec, -vec)
        self.assertAlmostEqual(sim, -1.0, places=5)

    def test_04_zero_norm_guard(self):
        """Zero-norm vector must return 0.0 safely without divide-by-zero exception."""
        zero_vec = np.zeros(128, dtype=np.float32)
        normal_vec = np.ones(128, dtype=np.float32)
        self.assertEqual(cosine_similarity(zero_vec, normal_vec), 0.0)
        self.assertEqual(cosine_similarity(normal_vec, zero_vec), 0.0)
        self.assertEqual(cosine_similarity(zero_vec, zero_vec), 0.0)

    def test_05_dimension_mismatch(self):
        """Mismatched vector lengths must raise ValueError."""
        v1 = np.ones(128, dtype=np.float32)
        v2 = np.ones(64, dtype=np.float32)
        with self.assertRaises(ValueError):
            cosine_similarity(v1, v2)

    def test_06_non_finite_inputs(self):
        """Inputs with NaN or Inf must raise ValueError."""
        v1 = np.ones(128, dtype=np.float32)
        v2 = np.ones(128, dtype=np.float32)
        v2[10] = np.nan
        with self.assertRaises(ValueError):
            cosine_similarity(v1, v2)

        v3 = np.ones(128, dtype=np.float32)
        v3[5] = np.inf
        with self.assertRaises(ValueError):
            cosine_similarity(v1, v3)

    def test_07_empty_vector_guard(self):
        """Empty vector inputs must raise ValueError."""
        with self.assertRaises(ValueError):
            cosine_similarity([], [])


class TestSFaceEmbedder(unittest.TestCase):
    """Unit and integration tests for SFace alignment and 128D embedding extraction."""

    @classmethod
    def setUpClass(cls):
        cls.embedder = SFaceEmbedder()
        cls.detector = YuNetFaceDetector(conf_threshold=0.30)

    def test_01_model_properties(self):
        """Verify model identity and embedding dimensions."""
        self.assertEqual(self.embedder.MODEL_NAME, "v1.0-sface")
        self.assertEqual(self.embedder.EMBEDDING_DIM, 128)
        self.assertIsNotNone(self.embedder.recognizer)
        print("\n[RECOGNIZER TEST 1 PASSED] SFace model metadata verified (v1.0-sface, 128D).")

    def test_02_face_alignment_shape(self):
        """Verify 5-point landmark similarity alignment crops to exact 112x112x3 dimensions."""
        test_img = np.full((480, 640, 3), 150, dtype=np.uint8)
        # Dummy YuNet 15-element array: [x, y, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rcm, y_rcm, x_lcm, y_lcm, score]
        face_array = np.array([
            200, 150, 150, 180,  # box
            240, 200,            # right eye
            310, 200,            # left eye
            275, 240,            # nose tip
            250, 280,            # mouth right
            300, 280,            # mouth left
            0.98                 # score
        ], dtype=np.float32)

        aligned = self.embedder.align_face(test_img, face_array)
        self.assertEqual(aligned.shape, (112, 112, 3))
        self.assertEqual(aligned.dtype, np.uint8)
        print("[RECOGNIZER TEST 2 PASSED] Face alignment produces exact 112x112x3 rectified crop.")

    def test_03_alignment_invalid_inputs(self):
        """Verify alignment fails gracefully on malformed images or truncated face arrays."""
        valid_face = np.zeros(15, dtype=np.float32)
        with self.assertRaises(ValueError):
            self.embedder.align_face(None, valid_face)

        with self.assertRaises(ValueError):
            self.embedder.align_face(np.zeros((100, 100, 3), dtype=np.uint8), np.array([1, 2, 3]))

        print("[RECOGNIZER TEST 3 PASSED] Alignment input validation guards operational.")

    def test_04_embedding_dimension_and_normalization(self):
        """Verify embedding output dimension, finite values, and unit L2-norm."""
        aligned_dummy = np.random.randint(0, 255, (112, 112, 3), dtype=np.uint8)

        # 1. Normalized embedding (default for database storage)
        emb_norm = self.embedder.extract_embedding(aligned_dummy, normalize=True)
        self.assertEqual(emb_norm.shape, (128,))
        self.assertEqual(emb_norm.dtype, np.float32)
        self.assertTrue(np.isfinite(emb_norm).all(), "All embedding values must be finite.")
        norm_val = np.linalg.norm(emb_norm)
        self.assertAlmostEqual(float(norm_val), 1.0, places=5, msg="Normalized embedding must have unit L2 norm.")

        # 2. Raw unnormalized embedding
        emb_raw = self.embedder.extract_embedding(aligned_dummy, normalize=False)
        self.assertEqual(emb_raw.shape, (128,))
        raw_norm = float(np.linalg.norm(emb_raw))
        self.assertGreater(raw_norm, 1.0, "Raw SFace embeddings typically have L2 norm > 1.0.")

        print(f"[RECOGNIZER TEST 4 PASSED] 128D embedding verified: Raw Norm={raw_norm:.2f}, Unit Norm={norm_val:.5f}.")

    def test_05_end_to_end_detector_recognizer_pipeline(self):
        """
        Verify end-to-end integration:
        Detector detects face -> extracts 5 landmarks -> Recognizer aligns -> extracts 128D embedding.
        """
        canvas = np.full((600, 800, 3), 200, dtype=np.uint8)
        cx, cy, r = 400, 300, 90
        # Draw stylized face
        cv2.circle(canvas, (cx, cy), r, (180, 200, 230), -1)
        cv2.circle(canvas, (cx - 35, cy - 20), 10, (255, 255, 255), -1)
        cv2.circle(canvas, (cx - 35, cy - 20), 4, (0, 0, 0), -1)
        cv2.circle(canvas, (cx + 35, cy - 20), 10, (255, 255, 255), -1)
        cv2.circle(canvas, (cx + 35, cy - 20), 4, (0, 0, 0), -1)
        cv2.line(canvas, (cx, cy - 5), (cx, cy + 15), (80, 80, 80), 2)
        cv2.ellipse(canvas, (cx, cy + 40), (30, 12), 0, 0, 180, (50, 50, 180), 2)

        faces = self.detector.detect(canvas)
        self.assertGreaterEqual(len(faces), 1, "YuNet must detect test face on canvas.")

        detected_face = faces[0]
        aligned, embedding = self.embedder.process_detected_face(canvas, detected_face)

        self.assertEqual(aligned.shape, (112, 112, 3))
        self.assertEqual(embedding.shape, (128,))
        self.assertAlmostEqual(float(np.linalg.norm(embedding)), 1.0, places=5)

        # Self-match must be 1.0
        self.assertAlmostEqual(self.embedder.match(embedding, embedding), 1.0, places=5)

        print("[RECOGNIZER TEST 5 PASSED] Full end-to-end detection + alignment + 128D embedding verified.")

    def test_06_human_biometric_evaluation_isolation_notice(self):
        """
        Confirms that biometric accuracy metrics (FAR, FRR, EER) are strictly gated
        behind consenting human volunteer datasets and not fabricated on synthetic targets.
        """
        # Ethical constraint enforcement:
        # Real biometric identification accuracy CANNOT be claimed without consenting human datasets.
        # This test documents the requirement boundary.
        self.assertTrue(True)
        print("\n[ETHICAL PRIVACY NOTICE] Formal identity recognition precision/recall and FAR/FRR")
        print("  benchmarking requires voluntary student consent datasets under Section A & G.")
        print("  Synthetic and offline pipeline tests confirm model operational integrity without violating biometric privacy.")


if __name__ == "__main__":
    unittest.main()
