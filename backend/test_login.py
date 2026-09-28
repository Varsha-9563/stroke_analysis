"""
Checks that login and permissions work.
Run while the server is running (in ANOTHER terminal):
    python test_login.py
"""
import requests

API = "http://127.0.0.1:8000"


def login(email, password):
    r = requests.post(f"{API}/api/login", data={"username": email, "password": password})
    return r


def get(path, token):
    return requests.get(f"{API}{path}", headers={"Authorization": f"Bearer {token}"})


print("1) Wrong password ->", login("dr.mehta@demo.com", "wrong").status_code, "(expect 401)")

doc = login("dr.mehta@demo.com", "doctor123").json()
print("2) Doctor login   ->", doc["name"], "|", doc["role"])
patients = get("/api/doctor/patients", doc["access_token"]).json()
print("   Her patients:", [(p["name"], p["first_score"], p["latest_score"]) for p in patients])

pat = login("ravi@demo.com", "patient123").json()
print("3) Patient login  ->", pat["name"], "|", pat["role"])
me = get("/api/patient/me", pat["access_token"]).json()
print("   Doctor:", me["doctor"], "| sessions:", len(me["sessions"]),
      "| latest score:", me["sessions"][-1]["recovery_score"])

print("\nPermission checks:")
print("4) Patient opens doctor page       ->",
      get("/api/doctor/patients", pat["access_token"]).status_code, "(expect 403)")
print("5) Dr. Mehta opens Dr. Rao's patient ->",
      get("/api/doctor/patients/4", doc["access_token"]).status_code, "(expect 404)")
print("6) No token at all                 ->",
      requests.get(f"{API}/api/patient/me").status_code, "(expect 401)")
