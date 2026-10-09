"""
Healthy reference ("what a normal hand looks like on THIS glove").

Built from backend/data/healthy_reference.csv, i.e. every recording of people the
doctor marked as "healthy volunteer". Patients are then compared with it:
    pct_of_healthy = patient's range of motion / healthy average range of motion x 100

When you record real healthy volunteers with your glove, their rows are added to
the same file automatically and the reference updates itself. If at least 3 real
(glove) healthy volunteers exist, only real data is used.
"""
import csv
from pathlib import Path

from data_logger import FINGER_NAMES, HEALTHY_REFERENCE

FINGERS = ["index", "middle", "ring", "little"]   # internal names (little = pinky)
_cache = {"mtime": None, "baseline": None}


def _load():
    path: Path = HEALTHY_REFERENCE
    if not path.exists():
        return None
    mtime = path.stat().st_mtime
    if _cache["mtime"] == mtime:
        return _cache["baseline"]

    with open(path, encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    real = [r for r in rows if r.get("data_source") == "glove"]
    if len({r["patient_id"] for r in real}) >= 3:
        rows, used = real, "real glove recordings"
    else:
        used = "real + synthetic recordings" if real else "synthetic recordings"
    if not rows:
        return None

    def mean(key):
        vals = [float(r[key]) for r in rows if r.get(key) not in (None, "")]
        return round(sum(vals) / len(vals), 1) if vals else None

    baseline = {
        "people": len({r["patient_id"] for r in rows}),
        "recordings": len(rows),
        "based_on": used,
        "recovery_score": mean("recovery_score"),
        "rom": {f: mean(f"{n}_rom_deg") for f, n in zip(FINGERS, FINGER_NAMES)},
        "bends": {f: mean(f"{n}_bends") for f, n in zip(FINGERS, FINGER_NAMES)},
    }
    _cache.update(mtime=mtime, baseline=baseline)
    return baseline


def baseline():
    """Healthy averages, or None if no healthy volunteer has been recorded yet."""
    return _load()


def pct_of_healthy(range_of_motion):
    """range_of_motion: {"index": deg, "middle": ..., "ring": ..., "little": ...}
    -> {"index": %, ..., "overall": %} compared with the healthy average, or None."""
    b = _load()
    if not b:
        return None
    out = {}
    for f in FINGERS:
        ref = b["rom"].get(f)
        if ref:
            out[f] = round(min(range_of_motion.get(f, 0) / ref * 100, 120), 1)
    if not out:
        return None
    out["overall"] = round(sum(out.values()) / len(out), 1)
    return out
