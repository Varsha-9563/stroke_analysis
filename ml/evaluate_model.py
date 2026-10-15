
# import pandas as pd
# import numpy as np
# import joblib
# from sklearn.model_selection import train_test_split
# from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier

# print("Loading correct physics dataset...")
# # THIS WAS THE CULPRIT! Pointing to the actual simulator output:
# df = pd.read_csv("data/session_features.csv")  

# # Select only numeric data
# df_numeric = df.select_dtypes(include=[np.number])

# # Exclude labels so the model only trains on raw physical glove features
# exclude_cols = ["recovery_score", "day"]
# FEATURE_COLS = [c for c in df_numeric.columns if c not in exclude_cols]

# FINGERS = ["index", "middle", "ring", "pinky"]

# X = df[FEATURE_COLS]
# y_recovery = df["recovery_score"]
# X_train, X_test, y_train, y_test = train_test_split(X, y_recovery, test_size=0.2, random_state=42)

# print(f"Training on exactly {len(FEATURE_COLS)} physical features...")
# recovery_model = RandomForestRegressor(n_estimators=100, random_state=42)
# recovery_model.fit(X_train, y_train)

# finger_models = {}
# for finger in FINGERS:
#     y_finger = df[f"{finger}_status"] 
#     X_train_f, X_test_f, y_train_f, y_test_f = train_test_split(X, y_finger, test_size=0.2, random_state=42)
    
#     classifier = RandomForestClassifier(n_estimators=100, random_state=42)
#     classifier.fit(X_train_f, y_train_f)
#     finger_models[finger] = classifier

# # Save the models for the FastAPI backend
# export_data = {"features": FEATURE_COLS, "recovery": recovery_model, "fingers": finger_models}
# joblib.dump(export_data, "rehab_models.joblib")

# print("✅ Successfully trained and saved rehab_models.joblib!")
import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier

print("Loading correct physics dataset...")
df = pd.read_csv("data/session_features.csv")  

# Select only numeric data
df_numeric = df.select_dtypes(include=[np.number])

# Exclude labels so the model only trains on raw physical glove features
exclude_cols = ["recovery_score", "day"]
FEATURE_COLS = [c for c in df_numeric.columns if c not in exclude_cols]

# MUST match analysis.py perfectly:
FINGERS = ["index", "middle", "ring", "pinky"]

X = df[FEATURE_COLS]
y_recovery = df["recovery_score"]
X_train, X_test, y_train, y_test = train_test_split(X, y_recovery, test_size=0.2, random_state=42)

print(f"Training on exactly {len(FEATURE_COLS)} physical features...")
recovery_model = RandomForestRegressor(n_estimators=100, random_state=42)
recovery_model.fit(X_train, y_train)

finger_models = {}
for finger in FINGERS:
    y_finger = df[f"{finger}_status"] 
    X_train_f, X_test_f, y_train_f, y_test_f = train_test_split(X, y_finger, test_size=0.2, random_state=42)
    
    classifier = RandomForestClassifier(n_estimators=100, random_state=42)
    classifier.fit(X_train_f, y_train_f)
    finger_models[finger] = classifier

# Save the models for the FastAPI backend
export_data = {"features": FEATURE_COLS, "recovery": recovery_model, "fingers": finger_models}
joblib.dump(export_data, "rehab_models.joblib")

print("✅ Successfully trained and saved rehab_models.joblib!")