"""
Fills the database with demo data so the dashboards have something to show:
  - the exercise library (from exercises.py)
  - 2 doctors
  - 6 patients (3 per doctor), each with 8 weeks of glove sessions from the
    fake dataset (analysed by the real model), an exercise plan, and some
    ticked-off exercise days so streaks show up.

Run from the backend folder (the server does NOT need to be running):
    python seed_data.py
Running it again WIPES the database and starts fresh.

Demo logins:
    doctor : dr.mehta@demo.com  / doctor123
    doctor : dr.rao@demo.com    / doctor123
    patient: ravi@demo.com      / patient123   (and the other patient emails below)
"""
import random
from datetime import date, datetime, time, timedelta
from pathlib import Path

import pandas as pd

from analysis import analyze_session
from auth import hash_password
from database import (Base, Exercise, ExerciseLog, GloveSession, Patient,
                      Prescription, SessionLocal, User, create_tables, engine)
from exercises import EXERCISE_LIBRARY

RAW_CSV = Path(__file__).resolve().parent.parent / "ml" / "data" / "raw_readings.csv"
TODAY = date.today()
REHAB_START = datetime.combine(TODAY - timedelta(days=56), time(10, 0))  # day 0 of the fake data
random.seed(7)

DOCTORS = [
    ("Dr. Anjali Mehta", "dr.mehta@demo.com", "Neurology"),
    ("Dr. Suresh Rao", "dr.rao@demo.com", "Physical Medicine & Rehabilitation"),
]
# (name, email, fake-dataset patient id, doctor index, how often they do exercises 0..1)
PATIENTS = [
    ("Ravi Kumar", "ravi@demo.com", "P001", 0, 0.9),
    ("Lakshmi Iyer", "lakshmi@demo.com", "P002", 0, 0.7),
    ("Arjun Nair", "arjun@demo.com", "P003", 0, 0.4),
    ("Fatima Sheikh", "fatima@demo.com", "P004", 1, 0.8),
    ("Joseph D'Souza", "joseph@demo.com", "P005", 1, 0.6),
    ("Meena Pillai", "meena@demo.com", "P006", 1, 0.5),
]


def main():
    Base.metadata.drop_all(bind=engine)
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

    print(f"Loading fake glove data from {RAW_CSV.name} ...")
    raw = pd.read_csv(RAW_CSV)
    cols = ["t_ms", "thumb", "index", "middle", "ring", "little"]

    for i, (name, email, sim_id, doc_idx, diligence) in enumerate(PATIENTS, start=1):
        u = User(name=name, email=email, password_hash=hash_password("patient123"), role="patient")
        db.add(u)
        db.flush()
        p = Patient(user_id=u.id, doctor_id=doctors[doc_idx].id,
                    stroke_date=REHAB_START.date() - timedelta(days=10),
                    device_id=f"glove-{i:02d}")
        db.add(p)
        db.flush()

        # glove sessions (every 4 days over 8 weeks)
        latest_suggestions = []
        for _, sess in raw[raw["patient_id"] == sim_id].groupby("session_id"):
            day = int(sess["day"].iloc[0])
            result = analyze_session(sess[cols].values.tolist())
            latest_suggestions = result["suggested_exercises"]
            db.add(GloveSession(
                patient_id=p.id,
                recorded_at=REHAB_START + timedelta(days=day),
                recovery_score=result["recovery_score"],
                finger_status=result["finger_status"],
                range_of_motion=result["range_of_motion"],
                features=result["features"],
                suggested_exercises=result["suggested_exercises"],
            ))

        # exercise plan = latest suggestions, prescribed 3 weeks ago
        for ex_name in latest_suggestions:
            rx = Prescription(patient_id=p.id, exercise_id=ex_by_name[ex_name].id,
                              notes="Twice a day, stop if painful.",
                              created_at=datetime.combine(TODAY - timedelta(days=21), time(9)))
            db.add(rx)
            db.flush()
            # past ticks (not today, so you can try ticking today yourself)
            for back in range(1, 22):
                if random.random() < diligence:
                    db.add(ExerciseLog(prescription_id=rx.id, done_on=TODAY - timedelta(days=back)))
        db.commit()
        print(f"  {name:<16} -> doctor: {doctors[doc_idx].name}, plan: {len(latest_suggestions)} exercises")

    db.close()
    print("\nDone! Database saved as rehab.db")


if __name__ == "__main__":
    main()
