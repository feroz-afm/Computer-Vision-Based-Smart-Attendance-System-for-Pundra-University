"""
PUB AttendEye - Face Alignment & SFace Embedding Subsystem
Powered by OpenCV SFace (SphereFace2 / CASIA ResNet-based Deep Feature Extractor)
License: Apache 2.0 (OpenCV Model Zoo)
"""

import os
import sys
from typing import List, Optional, Tuple, Union
import cv2
import numpy as np

# Ensure project root is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.models_loader import get_sface_model_path
from backend.detector import DetectedFace


def cosine_similarity(
    vec1: Union[np.ndarray, List[float]],
    vec2: Union[np.ndarray, List[float]],
    eps: float = 1e-12,
) -> float:
    """
    Compute cosine similarity between two 1D feature vectors.
    Handles input validation, zero-norm guards, and dimension checks.
    Returns float in range [-1.0, 1.0].
    """
    a = np.asarray(vec1, dtype=np.float32).ravel()
    b = np.asarray(vec2, dtype=np.float32).ravel()

    if a.size == 0 or b.size == 0:
        raise ValueError("Input vectors must not be empty.")

    if a.shape != b.shape:
        raise ValueError(f"Vector dimension mismatch: {a.shape} vs {b.shape}")

    if not (np.isfinite(a).all() and np.isfinite(b).all()):
        raise ValueError("Input vectors must contain only finite numbers (no NaN or Inf).")

    norm_a = float(np.linalg.norm(a))
    norm_b = float(np.linalg.norm(b))

    if norm_a < eps or norm_b < eps:
        # Zero-norm vector cannot have a meaningful direction
        return 0.0

    sim = float(np.dot(a, b) / (norm_a * norm_b))
    # Clip to valid mathematical bounds [-1.0, 1.0] to guard against floating-point epsilon
    return max(-1.0, min(1.0, sim))


class SFaceEmbedder:
    """
    Extracts 128-dimensional facial biometric embeddings using OpenCV SFace.
    Performs 5-point landmark similarity alignment before feature extraction.
    """

    MODEL_NAME = "v1.0-sface"
    EMBEDDING_DIM = 128

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or get_sface_model_path()
        self.recognizer = cv2.FaceRecognizerSF.create(
            model=self.model_path,
            config="",
        )
        if self.recognizer is None:
            raise RuntimeError(f"Failed to initialize FaceRecognizerSF with {self.model_path}")

    def align_face(self, image: np.ndarray, raw_face_array: np.ndarray) -> np.ndarray:
        """
        Perform 5-point affine landmark alignment to crop and rectify face to (112, 112, 3).
        raw_face_array: 15-element array produced by YuNet face detector.
        """
        if image is None or image.size == 0:
            raise ValueError("Input image cannot be None or empty.")

        if raw_face_array is None or len(raw_face_array) < 14:
            raise ValueError("Raw face array must contain at least 14 elements (box + 5 landmarks).")

        raw_face_f32 = np.asarray(raw_face_array, dtype=np.float32)
        aligned = self.recognizer.alignCrop(image, raw_face_f32)

        if aligned is None or aligned.size == 0:
            raise RuntimeError("Failed to align face crop from landmarks.")

        return aligned

    def extract_embedding(
        self,
        aligned_face: np.ndarray,
        normalize: bool = True,
    ) -> np.ndarray:
        """
        Compute 128D embedding vector for an aligned face crop (112x112x3 BGR).
        If normalize is True, unit-normalizes the vector such that L2 norm == 1.0.
        Returns a 1D float32 numpy array of length 128.
        """
        if aligned_face is None or aligned_face.size == 0:
            raise ValueError("Aligned face cannot be None or empty.")

        if aligned_face.shape[:2] != (112, 112):
            raise ValueError(f"Aligned face must have shape (112, 112, 3), got {aligned_face.shape}")

        feature_matrix = self.recognizer.feature(aligned_face)
        if feature_matrix is None or feature_matrix.size != self.EMBEDDING_DIM:
            raise RuntimeError(f"Expected {self.EMBEDDING_DIM} features, got {feature_matrix.size if feature_matrix is not None else 0}")

        vector = feature_matrix.flatten().astype(np.float32)

        if not np.isfinite(vector).all():
            raise RuntimeError("Generated embedding contains non-finite values (NaN or Inf).")

        if normalize:
            norm = float(np.linalg.norm(vector))
            if norm > 1e-12:
                vector = vector / norm
            else:
                raise RuntimeError("Generated embedding has near-zero L2 norm.")

        return vector

    def process_detected_face(
        self,
        image: np.ndarray,
        detected_face: DetectedFace,
        normalize: bool = True,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Convenience pipeline: aligns face using detected_face.raw_array and extracts 128D embedding.
        Returns: (aligned_crop_112x112, normalized_128D_embedding)
        """
        aligned = self.align_face(image, detected_face.raw_array)
        embedding = self.extract_embedding(aligned, normalize=normalize)
        return aligned, embedding

    def match(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """Calculate pairwise cosine similarity between two embeddings."""
        return cosine_similarity(emb1, emb2)


if __name__ == "__main__":
    embedder = SFaceEmbedder()
    print(f"SFaceEmbedder initialized successfully (Model: {embedder.MODEL_NAME}, Dim: {embedder.EMBEDDING_DIM}).")
