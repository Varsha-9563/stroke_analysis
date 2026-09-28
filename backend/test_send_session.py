"""
Pretends to be the glove: takes one recorded session from the fake dataset
and sends it to the backend, then prints the analysis.

Run (while the server is running in ANOTHER terminal):
    python test_send_session.py            # default: P001 day 0
    python test_send_session.py P001_D56   # any session_id
"""
import sys
from pathlib import Path

import pandas as pd
import requests

SESSION_ID = sys.argv[1] if len(sys.argv) > 1 else "P001_D00"
RAW_CSV = Path(__file__).resolve().parent.parent / "ml" / "data" / "raw_readings.csv"

print(f"Loading {SESSION_ID} from {RAW_CSV.name} ...")
df = pd.read_csv(RAW_CSV)
rows = df[df["session_id"] == SESSION_ID]
if rows.empty:
    sys.exit(f"No session called {SESSION_ID}")

samples = rows[["t_ms", "thumb", "index", "middle", "ring", "little"]].values.tolist()
resp = requests.post("http://127.0.0.1:8000/api/analyze-session",
                     json={"device_id": "glove-01", "samples": samples})
resp.raise_for_status()
result = resp.json()

print(f"\nRecovery score: {result['recovery_score']} / 100")
print("Finger status :", result["finger_status"])
print("Range of motion (deg):", result["range_of_motion"])
print("Suggested exercises:")
for ex in result["suggested_exercises"]:
    print("  -", ex)
