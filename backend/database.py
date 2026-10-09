"""
Database setup + all tables for the project.

Uses SQLite (a single file, rehab.db, no installation needed).
Later you can switch to PostgreSQL by changing DATABASE_URL only.

If you change a table here, delete rehab.db and run `python seed_data.py` again
(SQLite does not update existing tables automatically).
"""
from datetime import datetime

from sqlalchemy import (JSON, Boolean, Column, Date, DateTime, Float, ForeignKey,
                        Integer, String, Text, create_engine)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

DATABASE_URL = "sqlite:///./rehab.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False)
Base = declarative_base()


def get_db():
    """Gives each API request its own database session, closed afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ------------------------------------------------------------------ tables
class User(Base):
    """Everyone who can log in: doctors and patients."""
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)          # "doctor" or "patient"
    specialization = Column(String)                # doctors only, optional


class Patient(Base):
    """Extra info for a user whose role is 'patient'."""
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    affected_hand = Column(String, default="right")
    stroke_date = Column(Date)
    status = Column(String, default="active")      # "active" or "recovered"
    group = Column(String, default="patient")      # "patient" or "healthy" (healthy volunteer)
    device_id = Column(String, unique=True)        # which glove this patient uses

    user = relationship("User", foreign_keys=[user_id])
    doctor = relationship("User", foreign_keys=[doctor_id])
    sessions = relationship("GloveSession", back_populates="patient",
                            order_by="GloveSession.recorded_at")
    prescriptions = relationship("Prescription", back_populates="patient")


class GloveSession(Base):
    """One glove recording and its ML analysis."""
    __tablename__ = "glove_sessions"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    recorded_at = Column(DateTime, default=datetime.now)
    recovery_score = Column(Float)
    finger_status = Column(JSON)         # {"index": "severe", ...}
    range_of_motion = Column(JSON)       # {"index": 21.2, ...}  degrees
    features = Column(JSON)              # all computed features
    suggested_exercises = Column(JSON)   # list of exercise names from the rules
    data_source = Column(String, default="glove")   # "glove", "simulator" or "synthetic"

    patient = relationship("Patient", back_populates="sessions")


class Exercise(Base):
    """The exercise library (filled by seed_data.py from exercises.py)."""
    __tablename__ = "exercises"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text)
    target_fingers = Column(String)      # e.g. "index,middle"


class Prescription(Base):
    """An exercise the doctor assigned to a patient."""
    __tablename__ = "prescriptions"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    exercise_id = Column(Integer, ForeignKey("exercises.id"), nullable=False)
    notes = Column(Text)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)

    patient = relationship("Patient", back_populates="prescriptions")
    exercise = relationship("Exercise")
    logs = relationship("ExerciseLog", back_populates="prescription")


class ExerciseLog(Base):
    """Patient ticked 'done' for a prescribed exercise on a given day (-> streaks)."""
    __tablename__ = "exercise_logs"
    id = Column(Integer, primary_key=True)
    prescription_id = Column(Integer, ForeignKey("prescriptions.id"), nullable=False)
    done_on = Column(Date, nullable=False)

    prescription = relationship("Prescription", back_populates="logs")


class GloveDevice(Base):
    """A physical glove (ESP32). Holds its calibration so raw readings can be
    turned into accurate bend angles. Created automatically the first time
    the glove sends data."""
    __tablename__ = "glove_devices"
    device_id = Column(String, primary_key=True)
    calibration = Column(JSON)           # {"flat": [5 ints], "bent": [5 ints]} or None
    calibrated_at = Column(DateTime)
    first_seen = Column(DateTime, default=datetime.now)


class Message(Base):
    """Messages shown on the website (e.g. 'You are recovered')."""
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    read = Column(Boolean, default=False)


def create_tables():
    Base.metadata.create_all(bind=engine)
