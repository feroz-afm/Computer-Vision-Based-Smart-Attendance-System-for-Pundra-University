"""
PUB AttendEye - Multi-Face Detection Subsystem
Powered by OpenCV YuNet (Deep Neural Network Face Detector)
License: Apache 2.0 (OpenCV Model Zoo)
"""

import os
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

# Ensure project root is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cv2
import numpy as np

from backend.models_loader import get_yunet_model_path


@dataclass
class DetectedFace:
    """Represents a single detected face with coordinates, landmarks, and confidence."""
    face_id: str
    box: Tuple[int, int, int, int]  # (x, y, w, h)
    confidence: float
    landmarks: Dict[str, Tuple[int, int]]  # right_eye, left_eye, nose_tip, mouth_right, mouth_left
    raw_array: np.ndarray  # 15-element array for downstream cv2.FaceRecognizerSF alignment


class YuNetFaceDetector:
    """Multi-face detector supporting arbitrary resolution images and batch multi-face detection."""

    def __init__(
        self,
        model_path: Optional[str] = None,
        conf_threshold: float = 0.60,
        nms_threshold: float = 0.30,
        top_k: int = 5000,
    ):
        self.model_path = model_path or get_yunet_model_path()
        self.conf_threshold = conf_threshold
        self.nms_threshold = nms_threshold
        self.top_k = top_k

        # Initialize detector with default dummy size; dynamically resized during inference
        self.detector = cv2.FaceDetectorYN.create(
            model=self.model_path,
            config="",
            input_size=(320, 320),
            score_threshold=self.conf_threshold,
            nms_threshold=self.nms_threshold,
            top_k=self.top_k,
        )

    def detect(self, image: np.ndarray) -> List[DetectedFace]:
        """
        Detect all faces in a given BGR image.
        Returns a list of DetectedFace objects sorted by confidence (descending).
        """
        if image is None or image.size == 0:
            return []

        h, w = image.shape[:2]
        self.detector.setInputSize((w, h))

        _, faces = self.detector.detect(image)

        if faces is None or len(faces) == 0:
            return []

        results: List[DetectedFace] = []
        for idx, face in enumerate(faces):
            # Face format: [x, y, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rcm, y_rcm, x_lcm, y_lcm, score]
            box = (int(face[0]), int(face[1]), int(face[2]), int(face[3]))
            score = float(face[14])

            landmarks = {
                "right_eye": (int(face[4]), int(face[5])),
                "left_eye": (int(face[6]), int(face[7])),
                "nose_tip": (int(face[8]), int(face[9])),
                "mouth_right": (int(face[10]), int(face[11])),
                "mouth_left": (int(face[12]), int(face[13])),
            }

            results.append(
                DetectedFace(
                    face_id=f"face_{idx+1:03d}",
                    box=box,
                    confidence=round(score, 4),
                    landmarks=landmarks,
                    raw_array=face.copy(),
                )
            )

        # Sort descending by detection confidence
        results.sort(key=lambda f: f.confidence, reverse=True)
        return results

    def draw_detections(
        self,
        image: np.ndarray,
        faces: List[DetectedFace],
        draw_landmarks: bool = True,
        color: Tuple[int, int, int] = (0, 220, 50),
    ) -> np.ndarray:
        """Render detection bounding boxes, confidence, and landmarks on an annotated image copy."""
        annotated = image.copy()
        for face in faces:
            x, y, w, h = face.box
            # Draw bounding box
            cv2.rectangle(annotated, (x, y), (x + w, y + h), color, 2)

            # Draw label
            label = f"{face.face_id}: {face.confidence*100:.1f}%"
            cv2.putText(
                annotated,
                label,
                (x, max(15, y - 6)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                1,
                cv2.LINE_AA,
            )

            # Draw 5-point landmarks
            if draw_landmarks:
                colors = {
                    "right_eye": (255, 0, 0),    # Blue
                    "left_eye": (0, 0, 255),     # Red
                    "nose_tip": (0, 255, 255),   # Yellow
                    "mouth_right": (255, 0, 255), # Magenta
                    "mouth_left": (255, 255, 0), # Cyan
                }
                for name, pt in face.landmarks.items():
                    cv2.circle(annotated, pt, 3, colors.get(name, (0, 255, 0)), -1)

        return annotated


if __name__ == "__main__":
    detector = YuNetFaceDetector()
    print("YuNetFaceDetector initialized successfully. Input size ready for dynamic adjustment.")
