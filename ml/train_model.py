"""
Baseline models for the rehab glove.

Model 1 (regression): session features -> recovery_score (0-100)
Model 2 (classification, one per finger): features -> good / moderate / severe
   -> the per-finger status drives the exercise recommendations.

Validation uses GroupKFold by patient: a patient's sessions are never in both
train and test, otherwise accuracy looks far better than it really is.

Run:  python train_model.py   (after simulate_dataset.py)
"""
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.model_selection import GroupKFold, cross_val_score

FINGERS = ["index", "middle", "ring", "little"]   # 4 flex sensors (no thumb)

df = pd.read_csv("data/session_features.csv")
label_cols = ["recovery_score"] + [f"{f}_status" for f in FINGERS]
X = df.drop(columns=["patient_id", "session_id", "day"] + label_cols)
groups = df["patient_id"]
cv = GroupKFold(n_splits=5)

reg = RandomForestRegressor(n_estimators=300, random_state=0)
mae = -cross_val_score(reg, X, df["recovery_score"], groups=groups, cv=cv,
                       scoring="neg_mean_absolute_error")
print(f"Recovery score  MAE: {mae.mean():.2f} points (0-100 scale)")
reg.fit(X, df["recovery_score"])

finger_models = {}
for f in FINGERS:
    clf = RandomForestClassifier(n_estimators=300, random_state=0, class_weight="balanced")
    acc = cross_val_score(clf, X, df[f"{f}_status"], groups=groups, cv=cv, scoring="f1_macro")
    print(f"{f:>6} status   F1: {acc.mean():.2f}")
    finger_models[f] = clf.fit(X, df[f"{f}_status"])

joblib.dump({"features": list(X.columns), "recovery": reg, "fingers": finger_models},
            "rehab_models.joblib")
print("Saved rehab_models.joblib (load this in the FastAPI backend)")
