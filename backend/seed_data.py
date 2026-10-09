"""
Fills the database (and the CSV files in backend/data/) with SYNTHETIC demo data:

  - the exercise library (from exercises.py)
  - 2 doctors
  - 8 healthy volunteers (3 recordings each)  -> the "healthy reference"
  - 10 stroke patients who have been in rehab for 2 weeks up to 1 year,
    each with a different recovery pattern (fast, steady, slow, levelling off)

The glove recordings are generated with the same glove simulator used to train the
model (ml/simulate_dataset.py) and analysed by the real model. Every row is marked
data_source = "synthetic" so it is never confused with real recordings.

Run from the backend folder (the server does NOT need to be running):
    python seed_data.py
Running it again WIPES the database and the CSV files and starts fresh
(it refuses if real glove recordings exist, unless you add --force, and it
always makes a backup folder backend/data_backup_<date>/ first).

Demo logins (password for every patient / volunteer: patient123)
    doctor : dr.mehta@demo.com / doctor123
    doctor : dr.rao@demo.com   / doctor123
    patient: ravi@demo.com, arjun@demo.com, ...   (see PATIENTS below)
"""
import math
import random
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path

import numpy as np

from analysis import N, analyze_session
from auth import hash_password
from data_logger import log_session, reset_all
from database import (Base, Exercise, ExerciseLog, GloveDevice, GloveSession, Patient,
                      Prescription, SessionLocal, User, create_tables, engine)
from exercises import EXERCISE_LIBRARY

# reuse the glove physics + movement model from ml/simulate_dataset.py
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ml"))
from simulate_dataset import angle_to_adc, simulate_session  # noqa: E402

TODAY = date.today()
random.seed(7)
np_rng = np.random.default_rng(7)

DOCTORS = [
    ("Dr. Anjali Mehta", "dr.mehta@demo.com", "Neurology"),
    ("Dr. Suresh Rao", "dr.rao@demo.com", "Physical Medicine & Rehabilitation"),
]

# Stroke patients.
# impairment: 0 = healthy finger, 1 = cannot move.  Recovery follows
#   impairment(day) = plateau + (start - plateau) * exp(-speed * day)
# (name, email, doctor, days in rehab, start, plateau, speed, exercise diligence 0..1, pattern)
PATIENTS = [
    ("Ravi Kumar",     "ravi@demo.com",    0, 365, 0.85, 0.06, 0.012, 0.90, "full recovery over a year"),
    ("Lakshmi Iyer",   "lakshmi@demo.com", 0, 270, 0.90, 0.12, 0.012, 0.75, "steady, 9 months"),
    ("Arjun Nair",     "arjun@demo.com",   0, 180, 0.80, 0.40, 0.015, 0.40, "levels off below target"),
    ("Fatima Sheikh",  "fatima@demo.com",  1, 180, 0.70, 0.10, 0.025, 0.85, "fast responder, 6 months"),
    ("Joseph D'Souza", "joseph@demo.com",  1, 120, 0.75, 0.18, 0.012, 0.60, "steady, 4 months"),
    ("Meena Pillai",   "meena@demo.com",   1,  90, 0.85, 0.22, 0.015, 0.55, "steady, 3 months"),
    ("Priya Menon",    "priya@demo.com",   0,  90, 0.65, 0.08, 0.035, 0.90, "fast responder, 3 months"),
    ("Rahul Verma",    "rahul@demo.com",   1,  60, 0.90, 0.35, 0.008, 0.35, "slow, 2 months"),
    ("Sneha Kulkarni", "sneha@demo.com",   0,  30, 0.80, 0.18, 0.020, 0.70, "1 month in"),
    ("Imran Khan",     "imran@demo.com",   1,  14, 0.90, 0.25, 0.012, 0.60, "just started"),
]

# Healthy volunteers (classmates): almost no impairment, recorded 3 times
# (day 0, day 1 and day 7) to check that the glove gives repeatable results.
HEALTHY = [
    ("Healthy Volunteer 1", "hv1@demo.com", 0), ("Healthy Volunteer 2", "hv2@demo.com", 0),
    ("Healthy Volunteer 3", "hv3@demo.com", 0), ("Healthy Volunteer 4", "hv4@demo.com", 0),
    ("Healthy Volunteer 5", "hv5@demo.com", 1), ("Healthy Volunteer 6", "hv6@demo.com", 1),
    ("Healthy Volunteer 7", "hv7@demo.com", 1), ("Healthy Volunteer 8", "hv8@demo.com", 1),
]


def session_days(history):
    """Recording days, counted back from today: dense recently, sparser long ago."""
    step = 3 if history <= 60 else 5 if history <= 180 else 7
    days = list(range(history, 0, -step))
    return sorted(set(days + [2, 1]) & set(range(1, history + 1)), reverse=True)


def fake_session(impairment):
    """20 s open-close recording from the glove simulator -> ESP32-style samples."""
    t, angles = simulate_session(impairment)
    adc = angle_to_adc(angles)
    return [[int(ms), *row] for ms, row in zip(t * 1000, adc.tolist())]


def add_person(db, name, email, doctor, device_id, group, rehab_days=0):
    u = User(name=name, email=email, password_hash=hash_password("patient123"), role="patient")
    db.add(u)
    db.flush()
    db.add(GloveDevice(device_id=device_id))
    p = Patient(user_id=u.id, doctor_id=doctor.id, group=group, device_id=device_id,
                stroke_date=(TODAY - timedelta(days=rehab_days + 10)) if group == "patient" else None)
    db.add(p)
    db.flush()
    return p


def record(db, p, when, impairment):
    """Generate one synthetic recording, analyse it, save it and append it to the CSV files."""
    samples = fake_session(impairment)
    result = analyze_session(samples)
    db.add(GloveSession(
        patient_id=p.id, recorded_at=when, data_source="synthetic",
        recovery_score=result["recovery_score"], finger_status=result["finger_status"],
        range_of_motion=result["range_of_motion"], features=result["features"],
        suggested_exercises=result["suggested_exercises"],
    ))
    db.flush()
    db.refresh(p)
    log_session(p, p.sessions[-1], samples, result)
    return result


def protect_real_data():
    """Refuse to wipe REAL glove recordings unless --force is given; always back them up first."""
    from data_logger import ALL_SESSIONS, DATA_DIR
    real = 0
    if ALL_SESSIONS.exists():
        import csv
        with open(ALL_SESSIONS, encoding="utf-8") as fh:
            real = sum(1 for r in csv.DictReader(fh) if r.get("data_source") == "glove")
    if real and "--force" not in sys.argv:
        sys.exit(f"STOP: backend/data has {real} REAL glove recordings. Running this would delete them.\n"
                 f"If you really want to start fresh, run:  python seed_data.py --force\n"
                 f"(a backup copy is made automatically before anything is deleted)")
    if DATA_DIR.exists() and any(DATA_DIR.rglob("*.csv")):
        import shutil
        backup = DATA_DIR.parent / f"data_backup_{datetime.now():%Y%m%d_%H%M%S}"
        shutil.copytree(DATA_DIR, backup)
        db_file = Path(__file__).resolve().parent / "rehab.db"
        if db_file.exists():
            shutil.copy2(db_file, backup / "rehab.db")
        print(f"Backup of the old data saved in {backup.name}/")


def main():
    protect_real_data()
    Base.metadata.drop_all(bind=engine)
    reset_all()                      # also clear the CSV files in backend/data/
    create_tables()
    db = SessionLocal()

    for ex in EXERCISE_LIBRARY:
        db.add(Exercise(**ex))
    db.commit()
    ex_by_name = {e.name: e for e in db.query(Exercise).all()}

    doctors = []
    for name, email, spec in DOCTORS:
        d = User(name=name, email=email, password_hash=hash_password("doctor123"),
                 role="doctor", specialization=spec)
        db.add(d)
        doctors.append(d)
    db.commit()

    # 1) healthy volunteers first, so patients can be compared with them
    print("Healthy volunteers (healthy reference):")
    for i, (name, email, doc_idx) in enumerate(HEALTHY, start=1):
        p = add_person(db, name, email, doctors[doc_idx], f"glove-h{i:02d}", "healthy")
        base = np_rng.uniform(0.0, 0.06, N)
        for days_ago in (8, 7, 1):
            imp = np.clip(base + np_rng.normal(0, 0.015, N), 0, 0.12)
            when = datetime.combine(TODAY - timedelta(days=days_ago), time(15, random.randint(0, 59)))
            record(db, p, when, imp)
        db.commit()
        scores = [s.recovery_score for s in p.sessions]
        print(f"  {name:<20} 3 recordings, score {min(scores):.0f}-{max(scores):.0f}")

    # 2) stroke patients
    print("\nStroke patients (takes ~40 s):")
    for i, (name, email, doc_idx, history, start, plateau, speed, diligence, pattern) in enumerate(PATIENTS, start=1):
        p = add_person(db, name, email, doctors[doc_idx], f"glove-{i:02d}", "patient", history)
        finger_start = np.clip(start + np_rng.normal(0, 0.06, N), 0.05, 1)    # fingers differ a bit
        finger_plateau = np.clip(plateau + np_rng.normal(0, 0.04, N), 0.02, 1)
        latest = None
        for days_ago in session_days(history):
            day = history - days_ago
            imp = finger_plateau + (finger_start - finger_plateau) * math.exp(-speed * day)
            imp = np.clip(imp * np_rng.uniform(0.94, 1.06, N), 0, 1)           # day-to-day variation
            when = datetime.combine(TODAY - timedelta(days=days_ago), time(10, random.randint(0, 59)))
            latest = record(db, p, when, imp)

        # exercise plan = latest suggestions, prescribed when rehab started
        for ex_name in latest["suggested_exercises"]:
            rx = Prescription(patient_id=p.id, exercise_id=ex_by_name[ex_name].id,
                              notes="Twice a day, stop if painful.",
                              created_at=datetime.combine(TODAY - timedelta(days=history), time(9)))
            db.add(rx)
            db.flush()
            for back in range(1, history + 1):           # past ticks (today left for you to try)
                if random.random() < diligence:
                    db.add(ExerciseLog(prescription_id=rx.id, done_on=TODAY - timedelta(days=back)))
        db.commit()
        first, last = p.sessions[0].recovery_score, p.sessions[-1].recovery_score
        print(f"  {name:<15} glove-{i:02d}  {history:>3} days  {len(p.sessions):>2} sessions  "
              f"score {first:5.1f} -> {last:5.1f}   ({pattern})")

    db.close()
    print("\nDone! Database: rehab.db   CSV files: backend/data/  (all rows marked synthetic)")


if __name__ == "__main__":
    main()
