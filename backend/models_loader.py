"""
PUB AttendEye - Model Weights Manager
Handles downloading and caching of official OpenCV Zoo model weights.
Licenses:
- YuNet: Apache 2.0 (OpenCV Zoo)
- SFace: Apache 2.0 (OpenCV Zoo / CASIA)
"""

import os
import urllib.request
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("model_loader")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "models")

# Official OpenCV Model Zoo Direct Media LFS URLs
YUNET_URL = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
SFACE_URL = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"

YUNET_FILENAME = "face_detection_yunet_2023mar.onnx"
SFACE_FILENAME = "face_recognition_sface_2021dec.onnx"


def ensure_models_dir() -> str:
    os.makedirs(MODELS_DIR, exist_ok=True)
    return MODELS_DIR


def download_file(url: str, destination_path: str, expected_min_bytes: int = 100_000) -> str:
    """Download a file with verification, removing partial/corrupted files."""
    if os.path.exists(destination_path):
        actual_size = os.path.getsize(destination_path)
        if actual_size >= expected_min_bytes:
            logger.info(f"Model already verified: {destination_path} ({actual_size} bytes)")
            return destination_path
        else:
            logger.warning(f"Removing undersized file {destination_path} ({actual_size} bytes)")
            try:
                os.remove(destination_path)
            except OSError:
                pass

    ensure_models_dir()
    logger.info(f"Downloading model from {url} to {destination_path}...")
    opener = urllib.request.build_opener()
    opener.addheaders = [("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PUB-AttendEye")]
    urllib.request.install_opener(opener)
    urllib.request.urlretrieve(url, destination_path)

    actual_size = os.path.getsize(destination_path)
    if actual_size < expected_min_bytes:
        raise RuntimeError(
            f"Downloaded file {destination_path} is too small ({actual_size} bytes). Expected at least {expected_min_bytes} bytes."
        )

    logger.info(f"Downloaded successfully: {destination_path} ({actual_size} bytes)")
    return destination_path


def get_yunet_model_path() -> str:
    """Return path to YuNet ONNX model (~232 KB), downloading if necessary."""
    target_path = os.path.join(MODELS_DIR, YUNET_FILENAME)
    return download_file(YUNET_URL, target_path, expected_min_bytes=200_000)


def get_sface_model_path() -> str:
    """Return path to SFace ONNX model (~10.6 MB), downloading if necessary."""
    target_path = os.path.join(MODELS_DIR, SFACE_FILENAME)
    return download_file(SFACE_URL, target_path, expected_min_bytes=10_000_000)


if __name__ == "__main__":
    p = get_yunet_model_path()
    print("YuNet model verified at:", p)
