"""
Synthetic dataset generator for the stroke-rehab flex glove.

Produces data in EXACTLY the format the real ESP32 will send (raw 12-bit ADC
values per finger), so the whole pipeline (backend, features, ML, dashboard)
can be built now and switched to real glove data later.

Outputs:
  data/raw_readings.csv     patient_id, session_id, day, t_ms, index, middle, ring, little (ADC 0-4095)
  data/session_features.csv one row per session: features + labels

Run:  python simulate_dataset.py
"""
import os
import numpy as np
import pandas as pd

rng = np.random.default_rng(42)

FINGERS = ["index", "middle", "ring", "pinky"]   # 4 flex sensors (no thumb)
N = len(FINGERS)
FS = 50                       # Hz, same as firmware
VCC, R_FIXED = 3.3, 47_000    # voltage divider
R_FLAT, R_BENT = 25_000, 100_000   # typical 2.2" flex sensor: flat vs ~90 deg
MAX_ANGLE = 90.0

# ---------------------------------------------------------------- sensor model
def angle_to_adc(angle):
    """Physics of the divider: bend -> resistance -> voltage -> ADC count."""
    frac = np.clip(angle / MAX_ANGLE, 0, 1.2)
    r = R_FLAT + (R_BENT - R_FLAT) * frac
    v = VCC * R_FIXED / (r + R_FIXED)
    adc = v / VCC * 4095 + rng.normal(0, 6, size=np.shape(angle))  # ADC noise
    return np.clip(np.round(adc), 1, 4095).astype(int)

def adc_to_angle(adc, r_flat=R_FLAT, r_bent=R_BENT):
    """Inverse used by the BACKEND on real data. r_flat / r_bent come from a
    per-GLOVE calibration (glove flat on table, then bent to 90 deg on a jig).
    Calibrate per glove, NOT per patient, or you normalise away the impairment."""
    v = np.asarray(adc) / 4095 * VCC
    r = R_FIXED * (VCC / v - 1)
    return (r - r_flat) / (r_bent - r_flat) * MAX_ANGLE

# ---------------------------------------------------------------- patient model
def simulate_session(impairment, duration_s=20):
    """Protocol: open-close the fist repeatedly for `duration_s` seconds.
    impairment: array(N) in [0,1]; 0 = healthy finger, 1 = no movement."""
    t = np.arange(0, duration_s, 1 / FS)
    angles = np.zeros((len(t), N))
    for i, imp in enumerate(impairment):
        rest = MAX_ANGLE * 0.35 * imp                      # spasticity: can't fully open
        peak = rest + (MAX_ANGLE - rest) * (1 - imp) * rng.uniform(0.9, 1.0)
        freq = 0.6 * (1 - 0.6 * imp)                       # slower when impaired
        wave = 0.5 - 0.5 * np.cos(2 * np.pi * freq * t + rng.uniform(0, 0.4))
        tremor = imp * 5 * np.sin(2 * np.pi * rng.uniform(3, 6) * t)  # jerkiness
        angles[:, i] = rest + (peak - rest) * wave + tremor + rng.normal(0, 1.0, len(t))
    return t, np.clip(angles, 0, 100)

# ---------------------------------------------------------------- features
def extract_features(angles):
    """angles: (n_samples, N) in degrees. Same function runs on real data."""
    feats = {}
    kernel = np.ones(5) / 5
    for i, f in enumerate(FINGERS):
        a = np.convolve(angles[:, i], kernel, mode="same")    # light smoothing
        vel = np.gradient(a, 1 / FS)
        lo, hi = np.percentile(a, 5), np.percentile(a, 95)
        mid = (lo + hi) / 2
        cycles = max(np.sum((a[:-1] < mid) & (a[1:] >= mid)), 1)
        dir_changes = np.sum(np.diff(np.sign(vel[np.abs(vel) > 5])) != 0)
        feats[f"{f}_min_angle"] = lo            # how open the hand gets
        feats[f"{f}_max_angle"] = hi            # how far it bends
        feats[f"{f}_rom"] = hi - lo             # range of motion
        feats[f"{f}_peak_vel"] = np.percentile(np.abs(vel), 95)
        feats[f"{f}_cycles_per_min"] = cycles / (len(a) / FS) * 60
        feats[f"{f}_jerkiness"] = dir_changes / cycles   # ~2 = smooth
    feats["mean_rom"] = np.mean([feats[f"{f}_rom"] for f in FINGERS])
    return feats

def finger_status(imp):
    return "good" if imp < 0.25 else ("moderate" if imp < 0.6 else "severe")

# ---------------------------------------------------------------- main
def main(n_patients=40, days=56, every=4):
    os.makedirs("data", exist_ok=True)
    raw_rows, feat_rows = [], []
    for p in range(1, n_patients + 1):
        pid = f"P{p:03d}"
        base = np.clip(rng.uniform(0.3, 0.95) + rng.normal(0, 0.1, N), 0.05, 1)
        k = rng.choice([rng.uniform(0.02, 0.05), rng.uniform(0.0, 0.01)], p=[0.8, 0.2])  # 20% slow responders
        for day in range(0, days + 1, every):
            imp = np.clip(base * np.exp(-k * rng.uniform(0.7, 1.3, N) * day), 0, 1)
            t, angles = simulate_session(imp)
            adc = angle_to_adc(angles)
            sid = f"{pid}_D{day:02d}"
            df = pd.DataFrame(adc, columns=FINGERS)
            df.insert(0, "t_ms", (t * 1000).astype(int))
            df.insert(0, "day", day)
            df.insert(0, "session_id", sid)
            df.insert(0, "patient_id", pid)
            raw_rows.append(df)

            # backend path: ADC -> angle (calibration) -> features
            feats = extract_features(adc_to_angle(adc))
            feats.update(patient_id=pid, session_id=sid, day=day)
            # LABELS (on real data these come from the doctor's assessment)
            feats["recovery_score"] = round(float(np.clip(100 * (1 - imp.mean()) + rng.normal(0, 3), 0, 100)), 1)
            for f, v in zip(FINGERS, imp):
                feats[f"{f}_status"] = finger_status(v)
            feat_rows.append(feats)

    pd.concat(raw_rows).to_csv("data/raw_readings.csv", index=False)
    feats = pd.DataFrame(feat_rows)
    lead = ["patient_id", "session_id", "day"]
    feats = feats[lead + [c for c in feats.columns if c not in lead]].round(3)
    feats.to_csv("data/session_features.csv", index=False)
    print(f"{len(feats)} sessions from {n_patients} patients written to data/")

if __name__ == "__main__":
    main()
