"""
Analysis engine: raw glove readings -> angles -> features -> ML prediction
-> suggested exercises.

The maths here is the SAME as in ml/simulate_dataset.py, so the model sees
data in exactly the form it was trained on.
"""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

FINGERS = ["thumb", "index", "middle", "ring", "little"]
FS = 50                         # samples per second (same as the ESP32 firmware)
VCC, R_FIXED = 3.3, 47_000      # voltage divider on the glove
R_FLAT, R_BENT = 25_000, 100_000  # glove calibration (replace with real values later)
MAX_ANGLE = 90.0

MODEL_PATH = Path(__file__).resolve().parent.parent / "ml" / "rehab_models.joblib"
_models = joblib.load(MODEL_PATH)


def adc_to_angle(adc):
    """ADC count (0-4095) -> finger bend angle in degrees."""
    adc = np.clip(np.asarray(adc, dtype=float), 1, 4095)
    v = adc / 4095 * VCC
    r = R_FIXED * (VCC / v - 1)
    return (r - R_FLAT) / (R_BENT - R_FLAT) * MAX_ANGLE


def extract_features(angles):
    """angles: (n_samples, 5) in degrees -> dict of session features."""
    feats = {}
    kernel = np.ones(5) / 5
    for i, f in enumerate(FINGERS):
        a = np.convolve(angles[:, i], kernel, mode="same")
        vel = np.gradient(a, 1 / FS)
        lo, hi = np.percentile(a, 5), np.percentile(a, 95)
        mid = (lo + hi) / 2
        cycles = max(np.sum((a[:-1] < mid) & (a[1:] >= mid)), 1)
        dir_changes = np.sum(np.diff(np.sign(vel[np.abs(vel) > 5])) != 0)
        feats[f"{f}_min_angle"] = lo
        feats[f"{f}_max_angle"] = hi
        feats[f"{f}_rom"] = hi - lo
        feats[f"{f}_peak_vel"] = np.percentile(np.abs(vel), 95)
        feats[f"{f}_cycles_per_min"] = cycles / (len(a) / FS) * 60
        feats[f"{f}_jerkiness"] = dir_changes / cycles
    feats["mean_rom"] = np.mean([feats[f"{f}_rom"] for f in FINGERS])
    return feats


def suggest_exercises(feats, status):
    """Simple, explainable rules. The doctor confirms or changes these.
    Returns exercise NAMES that exist in exercises.py."""
    out = []
    weak = [f for f in FINGERS if status[f] != "good"]
    if not weak:
        return ["Maintenance fist open-close"]
    if any(status[f] == "severe" for f in FINGERS):
        out.append("Passive range of motion")
    if np.mean([feats[f"{f}_min_angle"] for f in FINGERS]) > 15:
        out.append("Finger extension stretch")    # hand can't fully open
    if status["thumb"] != "good":
        out.append("Thumb opposition")
    if any(status[f] != "good" for f in ["ring", "little"]):
        out.append("Finger isolation lifts")
    if np.mean([feats[f"{f}_jerkiness"] for f in FINGERS]) > 6:
        out.append("Soft ball squeeze")           # jerky, uncontrolled movement
    if len(out) < 2:
        out.append("Tendon glides")
    return out


def analyze_session(samples):
    """samples: list of [t_ms, thumb, index, middle, ring, little] (raw ADC).
    Returns the full analysis the frontend will show."""
    arr = np.asarray(samples, dtype=float)
    angles = adc_to_angle(arr[:, 1:6])
    feats = extract_features(angles)

    X = pd.DataFrame([feats])[_models["features"]]
    score = float(np.clip(_models["recovery"].predict(X)[0], 0, 100))
    status = {f: str(_models["fingers"][f].predict(X)[0]) for f in FINGERS}

    return {
        "recovery_score": round(score, 1),
        "finger_status": status,
        "range_of_motion": {f: round(float(feats[f"{f}_rom"]), 1) for f in FINGERS},
        "suggested_exercises": suggest_exercises(feats, status),
        "features": {k: round(float(v), 3) for k, v in feats.items()},
    }
