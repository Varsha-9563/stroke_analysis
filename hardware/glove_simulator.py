"""
Glove simulator: pretends to be the ESP32 glove so you can demo live recording
without the hardware. It sends EXACTLY what the real firmware sends:

    POST /api/glove/readings   {"device_id": "glove-03", "samples": [[t_ms, index, middle, ring, pinky], ...]}

50 samples per second, one request per second, forever (Ctrl+C to stop).

Run (backend must be running):
    python glove_simulator.py --device glove-03 --level 0.5

--level is how impaired the hand is: 0 = healthy, 1 = can't move.
While it runs you can type and press Enter:
    0.35    new impairment level (e.g. lower it after "doing the exercises"
            to show improvement in the next recording)
    flat    hold the hand still and flat   (for the "Calibrate glove" step)
    fist    hold a still, full fist        (for the "Calibrate glove" step)
    move    go back to opening/closing the hand
"""
import argparse
import threading
import time

import numpy as np
import requests

FS = 50
VCC, R_FIXED = 3.3, 47_000
R_FLAT, R_BENT = 25_000, 100_000
MAX_ANGLE = 90.0
FINGERS = ["index", "middle", "ring", "little"]   # 4 flex sensors (no thumb)
N = len(FINGERS)

rng = np.random.default_rng()
state = {"level": 0.5, "pose": "move"}


def finger_angles(t, impairment):
    """Bend angle of each finger at time t (s) while opening/closing the fist."""
    out = []
    for i, imp in enumerate(impairment):
        rest = MAX_ANGLE * 0.35 * imp                        # can't fully open
        peak = rest + (MAX_ANGLE - rest) * (1 - imp) * 0.95   # can't fully close
        freq = 0.6 * (1 - 0.6 * imp)                         # slower when impaired
        wave = 0.5 - 0.5 * np.cos(2 * np.pi * freq * t + i * 0.08)
        tremor = imp * 5 * np.sin(2 * np.pi * (4 + i * 0.4) * t)
        out.append(rest + (peak - rest) * wave + tremor + rng.normal(0, 1.0))
    return np.clip(out, 0, 100)


def angle_to_adc(angle):
    """Same voltage-divider physics as the real glove (flex sensor on top, 47k to ground)."""
    frac = np.clip(np.asarray(angle) / MAX_ANGLE, 0, 1.2)
    r = R_FLAT + (R_BENT - R_FLAT) * frac
    v = VCC * R_FIXED / (r + R_FIXED)
    return np.clip(np.round(v / VCC * 4095 + rng.normal(0, 6, len(frac))), 1, 4095).astype(int)


def read_keyboard():
    while True:
        try:
            cmd = input().strip().lower()
            if cmd in ("flat", "fist", "move"):
                state["pose"] = cmd
                print(f"  -> pose: {cmd}")
                continue
            v = float(cmd)
            state["level"] = min(max(v, 0.0), 1.0)
            print(f"  -> impairment level now {state['level']:.2f}")
        except ValueError:
            print("  type a number between 0 and 1, or flat / fist / move")
        except EOFError:
            return


def main():
    ap = argparse.ArgumentParser(description="Pretend to be the ESP32 flex-sensor glove")
    ap.add_argument("--device", default="glove-01", help="glove ID (must match the patient's paired glove)")
    ap.add_argument("--server", default="http://127.0.0.1:8000", help="backend address")
    ap.add_argument("--level", type=float, default=0.5, help="impairment 0 (healthy) .. 1 (no movement)")
    args = ap.parse_args()
    state["level"] = args.level

    # each finger slightly different, like a real patient
    finger_offsets = rng.normal(0, 0.06, N)
    url = f"{args.server}/api/glove/readings"
    print(f"Simulated glove '{args.device}' -> {url}")
    print(f"Impairment level {args.level:.2f}. Type a new level, or flat / fist / move, + Enter. "
          "Ctrl+C to stop.\n")
    threading.Thread(target=read_keyboard, daemon=True).start()

    t0 = time.time()
    sent = 0
    while True:
        batch_start = time.time()
        imp = np.clip(state["level"] + finger_offsets, 0, 1)
        samples = []
        for k in range(FS):
            t = sent / FS
            if state["pose"] == "flat":
                angles = np.clip(rng.normal(0, 1.0, N), 0, None)
            elif state["pose"] == "fist":
                angles = MAX_ANGLE + rng.normal(0, 1.0, N)
            else:
                angles = finger_angles(t, imp)
            adc = angle_to_adc(angles)
            samples.append([int(t * 1000), *adc.tolist()])
            sent += 1
        try:
            r = requests.post(url, json={"device_id": args.device, "samples": samples, "source": "simulator"}, timeout=3)
            tag = "RECORDING" if r.ok and r.json().get("recording") else "streaming"
            status = f"{r.status_code} {tag}"
        except requests.RequestException as e:
            status = f"backend not reachable ({e.__class__.__name__})"
        print(f"\r[{time.time() - t0:6.0f}s] sent {sent:6d} samples | level {state['level']:.2f} "
              f"| {state['pose']} | {status}      ",
              end="", flush=True)
        time.sleep(max(0, 1.0 - (time.time() - batch_start)))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nstopped")
