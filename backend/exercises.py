"""
Exercise library. seed_data.py copies this into the `exercises` table
(ids 1, 2, 3 ... in this order).

analysis.suggest_exercises() suggests exercises BY NAME from this list,
so keep the names here and there identical.

The glove measures 4 fingers (index, middle, ring, pinky), so target_fingers
only uses those.
"""
EXERCISE_LIBRARY = [
    {
        "name": "Passive range of motion",
        "description": "A helper gently bends and straightens each finger. 10 slow reps per finger.",
        "target_fingers": "index,middle,ring,pinky",
    },
    {
        "name": "Finger extension stretch",
        "description": "Place the hand flat on a table and press the fingers straight. Hold 20 s, 5 reps.",
        "target_fingers": "index,middle,ring,pinky",
    },
    {
        "name": "Finger taps",
        "description": "Hand flat on a table; tap index, middle, ring and pinky in turn, then back. 10 rounds.",
        "target_fingers": "index,middle,ring,pinky",
    },
    {
        "name": "Finger isolation lifts",
        "description": "Hand flat on a table; lift one finger at a time. 10 reps per finger.",
        "target_fingers": "index,middle,ring,pinky",
    },
    {
        "name": "Soft ball squeeze",
        "description": "Squeeze a soft ball slowly: 3 s in, 3 s out. 15 reps.",
        "target_fingers": "index,middle,ring,pinky",
    },
    {
        "name": "Tendon glides",
        "description": "Move through straight, hook, full fist and flat fist positions. 10 reps.",
        "target_fingers": "index,middle,ring,pinky",
    },
    {
        "name": "Fingertip pinch",
        "description": "Pinch a small object between the thumb and each finger in turn. 10 reps each.",
        "target_fingers": "index,middle,ring,pinky",
    },
    {
        "name": "Pick up small objects",
        "description": "Pick up coins or beans and place them in a cup. 5 minutes.",
        "target_fingers": "index,middle",
    },
    {
        "name": "Rubber-band finger spread",
        "description": "Spread the fingers apart against a rubber band. 15 reps.",
        "target_fingers": "index,middle,ring,pinky",
    },
    {
        "name": "Maintenance fist open-close",
        "description": "Full fist then fully open hand. 2 sets of 15 reps daily.",
        "target_fingers": "index,middle,ring,pinky",
    },
]
