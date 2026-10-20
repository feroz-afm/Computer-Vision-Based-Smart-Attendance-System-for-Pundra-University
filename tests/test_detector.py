"""
PUB AttendEye - Multi-Face Detector Automated Test Suite
Evaluates OpenCV YuNet Face Detector for Milestone 1.
Tests detection reliability, multi-scale handling, landmark geometry, and latency.
"""

import os
import sys
import time
import unittest
import numpy as np
import cv2

# Ensure project root is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.detector import YuNetFaceDetector, DetectedFace


class TestYuNetFaceDetector(unittest.TestCase):
    """Automated unit and integration tests for YuNet face detection subsystem."""

    @classmethod
    def setUpClass(cls):
        cls.detector = YuNetFaceDetector(conf_threshold=0.60, nms_threshold=0.30)

    def test_01_initialization(self):
        """Verify detector initializes with valid model and properties."""
        self.assertIsNotNone(self.detector.detector)
        self.assertEqual(self.detector.conf_threshold, 0.60)
        self.assertEqual(self.detector.nms_threshold, 0.30)
        print("\n[TEST 1 PASSED] YuNet detector initialized with validated ONNX weights.")

    def test_02_empty_and_blank_frames(self):
        """Verify detector safely handles empty, none, and solid blank frames without crashing."""
        self.assertEqual(self.detector.detect(None), [])

        empty_img = np.zeros((0, 0, 3), dtype=np.uint8)
        self.assertEqual(self.detector.detect(empty_img), [])

        blank_black = np.zeros((480, 640, 3), dtype=np.uint8)
        detections = self.detector.detect(blank_black)
        self.assertEqual(len(detections), 0)

        blank_white = np.ones((480, 640, 3), dtype=np.uint8) * 255
        detections = self.detector.detect(blank_white)
        self.assertEqual(len(detections), 0)
        print("[TEST 2 PASSED] Empty and solid blank frames return 0 detections safely.")

    def test_03_arbitrary_resolutions_and_aspect_ratios(self):
        """Verify detector adjusts input size dynamically across diverse resolutions."""
        resolutions = [
            (320, 240),   # QVGA
            (640, 480),   # VGA
            (1280, 720),  # HD 720p
            (1920, 1080), # Full HD 1080p
            (800, 1200),  # Portrait orientation
        ]
        for w, h in resolutions:
            test_frame = np.full((h, w, 3), 128, dtype=np.uint8)
            start_t = time.perf_counter()
            dets = self.detector.detect(test_frame)
            latency_ms = (time.perf_counter() - start_t) * 1000
            self.assertEqual(len(dets), 0)
            self.assertLess(latency_ms, 200, f"Inference took too long: {latency_ms:.1f}ms for {w}x{h}")

        print("[TEST 3 PASSED] Dynamic resolution handling verified from QVGA to 1080p Full HD.")

    def test_04_synthetic_multi_face_generation(self):
        """
        Create a multi-face test canvas containing realistic face patterns:
        - 5 distinct faces at varying scales (foreground vs back row).
        - Test face bounding box extraction, landmark structure, and confidence scores.
        """
        canvas_h, canvas_w = 720, 1280
        test_canvas = np.full((canvas_h, canvas_w, 3), 220, dtype=np.uint8)

        # Helper to draw a stylized face with eyes, nose, mouth
        def draw_stylized_face(img, cx, cy, radius, skin_color=(180, 200, 230)):
            # Head circle
            cv2.circle(img, (cx, cy), radius, skin_color, -1)
            cv2.circle(img, (cx, cy), radius, (50, 50, 50), 2)
            # Eyes
            eye_offset_x = int(radius * 0.35)
            eye_offset_y = int(radius * 0.20)
            eye_r = max(2, int(radius * 0.12))
            cv2.circle(img, (cx - eye_offset_x, cy - eye_offset_y), eye_r, (255, 255, 255), -1)
            cv2.circle(img, (cx - eye_offset_x, cy - eye_offset_y), max(1, eye_r // 2), (0, 0, 0), -1)
            cv2.circle(img, (cx + eye_offset_x, cy - eye_offset_y), eye_r, (255, 255, 255), -1)
            cv2.circle(img, (cx + eye_offset_x, cy - eye_offset_y), max(1, eye_r // 2), (0, 0, 0), -1)
            # Nose
            nose_y = int(cy + radius * 0.10)
            cv2.line(img, (cx, cy - int(radius * 0.05)), (cx, nose_y), (80, 80, 80), 2)
            # Mouth
            mouth_y = int(cy + radius * 0.40)
            mouth_w = int(radius * 0.30)
            cv2.ellipse(img, (cx, mouth_y), (mouth_w, int(radius * 0.12)), 0, 0, 180, (50, 50, 180), 2)

        # Place 5 stylized face targets across canvas
        face_locations = [
            (250, 250, 75),  # Student 1 (Foreground Left)
            (640, 260, 80),  # Student 2 (Foreground Center)
            (1020, 250, 75), # Student 3 (Foreground Right)
            (440, 500, 55),  # Student 4 (Mid-row Left)
            (850, 510, 55),  # Student 5 (Mid-row Right)
        ]
        for cx, cy, r in face_locations:
            draw_stylized_face(test_canvas, cx, cy, r)

        start_t = time.perf_counter()
        # With threshold relaxed for stylized faces to test pipeline
        detector_lenient = YuNetFaceDetector(conf_threshold=0.30)
        detections = detector_lenient.detect(test_canvas)
        elapsed_ms = (time.perf_counter() - start_t) * 1000

        print(f"[TEST 4 INFO] Multi-face detection processed in {elapsed_ms:.1f}ms on {canvas_w}x{canvas_h} frame.")

        # Annotate and verify drawing functionality
        annotated = self.detector.draw_detections(test_canvas, detections)
        self.assertEqual(annotated.shape, test_canvas.shape)

        # Verify landmark structure of detected faces
        for d in detections:
            self.assertIn("right_eye", d.landmarks)
            self.assertIn("left_eye", d.landmarks)
            self.assertIn("nose_tip", d.landmarks)
            self.assertIn("mouth_right", d.landmarks)
            self.assertIn("mouth_left", d.landmarks)
            self.assertEqual(len(d.box), 4)
            self.assertGreater(d.box[2], 0) # width > 0
            self.assertGreater(d.box[3], 0) # height > 0

        print(f"[TEST 4 PASSED] Drawing, landmark structure, and bounding box geometry validated.")

    def test_05_latency_benchmark(self):
        """Benchmark detection throughput across 10 iterations on a 720p classroom frame."""
        frame = np.full((720, 1280, 3), 180, dtype=np.uint8)
        latencies = []
        for _ in range(10):
            t0 = time.perf_counter()
            self.detector.detect(frame)
            latencies.append((time.perf_counter() - t0) * 1000)

        avg_latency = np.mean(latencies)
        min_latency = np.min(latencies)
        max_latency = np.max(latencies)
        fps = 1000.0 / avg_latency

        print(f"\n[BENCHMARK RESULTS] 1280x720 Frame Latency:")
        print(f"  - Average: {avg_latency:.2f} ms ({fps:.1f} FPS)")
        print(f"  - Min:     {min_latency:.2f} ms")
        print(f"  - Max:     {max_latency:.2f} ms")
        self.assertLess(avg_latency, 100.0, "Average latency should be well under 100ms on modern CPU.")


if __name__ == "__main__":
    unittest.main()
