"""
Backend Inference Preprocessor Wrapper.
Reuses the exact TelcoChurnPreprocessor fitted during training on X_train.
"""

import os
import pickle
import sys
from typing import Any, Dict, List

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from ml.preprocessing import TelcoChurnPreprocessor, normalize_input_record


def load_serialized_preprocessor(preprocessor_path: str) -> TelcoChurnPreprocessor:
    if not os.path.exists(preprocessor_path):
        raise FileNotFoundError(f"Serialized preprocessor not found at {preprocessor_path}")
    with open(preprocessor_path, "rb") as f:
        data = pickle.load(f)
    return TelcoChurnPreprocessor.from_dict(data)


__all__ = ["TelcoChurnPreprocessor", "normalize_input_record", "load_serialized_preprocessor"]
