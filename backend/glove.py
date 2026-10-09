"""
Live glove connection: the ESP32 (or hardware/glove_simulator.py) streams readings,
the patient starts/stops a recording from the website, and the recording is
analysed by the ML model and saved as a GloveSession.

How the pieces talk:

  ESP32 ──POST /api/glove/readings (every second, 50 samples)──▶ backend
                                                                   │ keeps the last few
                                                                   │ seconds in memory
  Website (patient) ──POST /api/patient/glove/start──────────────▶ │ starts collecting
  Website ──GET  /api/patient/glove/live (every 0.3 s)───────────▶ │ live finger angles
  Website ──POST /api/patient/glove/stop─────────────────────────▶ │ analyse + save

Live data and running recordings are kept in memory (fine for one backend
process, which is how uvicorn runs here). Saved sessions go to the database.
"""
import threading
import time
from collections import deque
from datetime import datetime
from typing import List, Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from analysis import FINGERS, N, adc_to_angle, analyze_session
from auth import get_current_user, require_patient
from data_logger import log_session
from forecast import predict
from healthy import pct_of_healthy
from database import GloveDevice, GloveSession, Patient, User, get_db

router = APIRouter()

ONLINE_SECONDS = 3           # glove counts as "connected" if it sent data this recently
LIVE_BUFFER = 150            # last 3 s at 50 Hz (used for live view + calibration)
DEFAULT_DURATION = 20        # seconds per recording (open-close the fist repeatedly)
MIN_SAMPLES = 250            # at least 5 s of data to analyse

_lock = threading.Lock()
_live = {}                   # device_id -> {"last_seen": float, "buffer": deque}
_recordings = {}             # device_id -> {"patient_id", "started", "duration", "samples": []}


# ------------------------------------------------------------------ helpers
def _device_state(device_id):
    return _live.get(device_id)


def _is_online(device_id):
    st = _device_state(device_id)
    return bool(st) and time.time() - st["last_seen"] < ONLINE_SECONDS


def _get_or_create_device(db, device_id):
    dev = db.get(GloveDevice, device_id)
    if not dev:
        dev = GloveDevice(device_id=device_id)
        db.add(dev)
        db.commit()
    return dev


def _my_patient(db, user):
    p = db.query(Patient).filter(Patient.user_id == user.id).first()
    if not p:
        raise HTTPException(404, "Patient profile not found")
    return p


def _require_device(p):
    if not p.device_id:
        raise HTTPException(400, "No glove is paired with your account yet. Enter your glove ID first.")
    return p.device_id


# ------------------------------------------------------------------ from the glove
class Readings(BaseModel):
    device_id: str
    source: Optional[str] = None     # glove_simulator.py sends "simulator"; the ESP32 sends nothing
    # each sample: [t_ms, index, middle, ring, little]  (raw ADC 0-4095)
    samples: List[List[float]]


@router.post("/api/glove/readings")
def receive_readings(data: Readings, db: Session = Depends(get_db)):
    """Called by the ESP32 about once per second with ~50 samples."""
    good = [s for s in data.samples if len(s) == N + 1]
    if not good:
        raise HTTPException(400, "Each sample must be [t_ms, index, middle, ring, little]")
    if data.device_id not in _live:
        _get_or_create_device(db, data.device_id)   # remember new gloves
    with _lock:
        st = _live.setdefault(data.device_id, {"last_seen": 0, "buffer": deque(maxlen=LIVE_BUFFER)})
        st["last_seen"] = time.time()
        st["source"] = "simulator" if data.source == "simulator" else "glove"
        st["buffer"].extend(good)
        rec = _recordings.get(data.device_id)
        if rec:
            rec["samples"].extend(good)
            recording = True
        else:
            recording = False
    return {"ok": True, "recording": recording}


# ------------------------------------------------------------------ patient: pairing + live view
class PairBody(BaseModel):
    device_id: str


@router.get("/api/patient/glove")
def glove_status(user: User = Depends(require_patient), db: Session = Depends(get_db)):
    p = _my_patient(db, user)
    dev = db.get(GloveDevice, p.device_id) if p.device_id else None
    return {
        "device_id": p.device_id,
        "online": bool(p.device_id) and _is_online(p.device_id),
        "calibrated": bool(dev and dev.calibration),
        "calibrated_at": dev.calibrated_at.isoformat() if dev and dev.calibrated_at else None,
        "recording": bool(p.device_id and p.device_id in _recordings),
        "default_duration": DEFAULT_DURATION,
        "known_gloves": sorted(d for d in _live if _is_online(d)),  # gloves sending right now
    }


@router.put("/api/patient/glove")
def pair_glove(body: PairBody, user: User = Depends(require_patient), db: Session = Depends(get_db)):
    device_id = body.device_id.strip()
    if not device_id:
        raise HTTPException(400, "Enter the glove ID (e.g. glove-01)")
    # One physical glove is shared by many people (e.g. collecting healthy volunteers one
    # after another): pairing simply moves the glove to whoever pairs it now.
    if device_id in _recordings:
        raise HTTPException(409, "This glove is recording for someone else right now. Try again in a moment.")
    other = db.query(Patient).filter(Patient.device_id == device_id, Patient.user_id != user.id).first()
    previous_owner = other.user.name if other else None
    if other:
        other.device_id = None
        db.flush()
    p = _my_patient(db, user)
    p.device_id = device_id
    _get_or_create_device(db, device_id)
    db.commit()
    return {"ok": True, "device_id": device_id, "moved_from": previous_owner}


@router.get("/api/patient/glove/live")
def glove_live(user: User = Depends(require_patient), db: Session = Depends(get_db)):
    """Polled by the website ~3 times per second."""
    p = _my_patient(db, user)
    device_id = _require_device(p)
    dev = db.get(GloveDevice, device_id)
    calib = dev.calibration if dev else None
    with _lock:
        st = _device_state(device_id)
        latest = list(st["buffer"])[-5:] if st else []
        rec = _recordings.get(device_id)
        rec_info = None
        if rec:
            rec_info = {"elapsed": round(time.time() - rec["started"], 1),
                        "duration": rec["duration"], "samples": len(rec["samples"])}
    angles = raw = None
    if latest:
        arr = np.asarray(latest, dtype=float)[:, 1:N + 1]
        raw_avg = arr.mean(axis=0)
        ang = adc_to_angle(raw_avg, calib)
        angles = {f: round(float(np.clip(a, 0, 90)), 1) for f, a in zip(FINGERS, ang)}
        raw = {f: int(v) for f, v in zip(FINGERS, raw_avg)}
    return {"online": _is_online(device_id), "angles": angles, "raw": raw, "recording": rec_info}


# ------------------------------------------------------------------ patient: record a session
class StartBody(BaseModel):
    duration: Optional[int] = None


@router.post("/api/patient/glove/start")
def start_recording(body: StartBody, user: User = Depends(require_patient), db: Session = Depends(get_db)):
    p = _my_patient(db, user)
    device_id = _require_device(p)
    if not _is_online(device_id):
        raise HTTPException(409, f"Glove '{device_id}' is not sending data. Switch it on and check Wi-Fi.")
    duration = max(10, min(body.duration or DEFAULT_DURATION, 60))
    with _lock:
        _recordings[device_id] = {"patient_id": p.id, "started": time.time(),
                                  "duration": duration, "samples": []}
    return {"ok": True, "duration": duration}


@router.post("/api/patient/glove/cancel")
def cancel_recording(user: User = Depends(require_patient), db: Session = Depends(get_db)):
    p = _my_patient(db, user)
    with _lock:
        _recordings.pop(p.device_id, None)
    return {"ok": True}


@router.post("/api/patient/glove/stop")
def stop_recording(user: User = Depends(require_patient), db: Session = Depends(get_db)):
    """Ends the recording, runs the ML analysis, saves it, and compares with the previous session."""
    p = _my_patient(db, user)
    device_id = _require_device(p)
    with _lock:
        rec = _recordings.pop(device_id, None)
    if not rec:
        raise HTTPException(400, "No recording in progress")
    samples = rec["samples"]
    if len(samples) < MIN_SAMPLES:
        raise HTTPException(400, f"Only {len(samples)} readings arrived (need {MIN_SAMPLES}). "
                                 "Keep the glove connected and record again.")

    dev = db.get(GloveDevice, device_id)
    result = analyze_session(samples, dev.calibration if dev else None)
    previous = p.sessions[-1] if p.sessions else None

    with _lock:
        source = (_live.get(device_id) or {}).get("source", "glove")
    s = GloveSession(
        patient_id=p.id,
        data_source=source,
        recovery_score=result["recovery_score"],
        finger_status=result["finger_status"],
        range_of_motion=result["range_of_motion"],
        features=result["features"],
        suggested_exercises=result["suggested_exercises"],
    )
    db.add(s)
    db.commit()
    db.refresh(p)
    csv_row = log_session(p, s, samples, result, dev.calibration if dev else None)   # append to CSV files

    comparison = None
    if previous:
        comparison = {
            "previous_date": previous.recorded_at.isoformat(),
            "previous_score": previous.recovery_score,
            "score_change": round(result["recovery_score"] - previous.recovery_score, 1),
            "rom_change": {f: round(result["range_of_motion"][f] - (previous.range_of_motion or {}).get(f, 0), 1)
                           for f in FINGERS},
        }
    return {
        "session_id": s.id,
        "recorded_at": s.recorded_at.isoformat(),
        "samples": len(samples),
        "recovery_score": result["recovery_score"],
        "finger_status": result["finger_status"],
        "range_of_motion": result["range_of_motion"],
        "suggested_exercises": result["suggested_exercises"],
        "comparison": comparison,
        "day": csv_row["day"],
        "data_source": source,
        "pct_of_healthy": pct_of_healthy(result["range_of_motion"]) if p.group != "healthy" else None,
        "forecast": _short_forecast(p),
    }


def _short_forecast(p):
    f = predict(p.sessions) if p.group != "healthy" else None
    if not f or "predicted_in_30_days" not in f:
        return f
    return {k: f[k] for k in ("predicted_in_30_days", "predicted_in_90_days", "target_day",
                              "days_to_target", "status", "message")}


# ------------------------------------------------------------------ calibration (once per glove)
class CalibrateBody(BaseModel):
    device_id: str
    pose: str            # "flat" or "bent"


@router.post("/api/glove/calibrate")
def calibrate(body: CalibrateBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Averages the last ~2 s of readings as the 'flat' or 'bent' reference.
    Do this ONCE per glove, worn by a healthy person (or on a jig), not by the patient -
    otherwise the patient's limited movement would look 'normal'."""
    if body.pose not in ("flat", "bent"):
        raise HTTPException(400, "pose must be 'flat' or 'bent'")
    if not _is_online(body.device_id):
        raise HTTPException(409, "The glove is not sending data")
    with _lock:
        buf = list(_live[body.device_id]["buffer"])[-100:]
    if len(buf) < 50:
        raise HTTPException(400, "Not enough data yet - wait 2 seconds and try again")
    values = np.asarray(buf, dtype=float)[:, 1:N + 1].mean(axis=0).round().astype(int).tolist()

    # first pose is held in memory until the second one arrives
    pending = _pending_calibration.setdefault(body.device_id, {})
    pending[body.pose] = values
    if "flat" not in pending or "bent" not in pending:
        return {"ok": True, "pose": body.pose, "values": values, "complete": False}

    diff = [abs(b - f) for f, b in zip(pending["flat"], pending["bent"])]
    dead = [FINGERS[i] for i, d in enumerate(diff) if d < 30]
    if dead:
        _pending_calibration.pop(body.device_id, None)
        raise HTTPException(400, f"Flat and bent readings are almost the same for: {', '.join(dead)}. "
                                 "Hold the hand still in each position (flat, then fist) and try again, "
                                 "or check those sensors' wiring.")
    weak = [FINGERS[i] for i, d in enumerate(diff) if d < 100]
    dev = _get_or_create_device(db, body.device_id)
    dev.calibration = {"flat": pending["flat"], "bent": pending["bent"]}
    dev.calibrated_at = datetime.now()
    db.commit()
    _pending_calibration.pop(body.device_id, None)
    return {"ok": True, "pose": body.pose, "values": values, "complete": True,
            "calibration": dev.calibration,
            "warning": (f"Very small change on: {', '.join(weak)}. Check the wiring/resistor of "
                        "those fingers." if weak else None)}


@router.delete("/api/glove/calibrate/{device_id}")
def reset_calibration(device_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    dev = db.get(GloveDevice, device_id)
    if dev:
        dev.calibration = None
        dev.calibrated_at = None
        db.commit()
    _pending_calibration.pop(device_id, None)
    return {"ok": True}


_pending_calibration = {}   # device_id -> {"flat": [...]} while waiting for "bent"
