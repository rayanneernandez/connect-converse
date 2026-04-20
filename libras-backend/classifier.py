"""
Rule-based classifier for a very small Libras vocabulary.

This is a starter: it recognises a handful of common greetings/responses from
hand-pose features. It's intentionally simple so you can:
  1. Run the meeting now with a real Libras → text loop, even if vocabulary is small.
  2. Swap in a proper trained model later (e.g. a small MLP / LSTM over a
     window of landmarks) without touching the rest of the pipeline.

Inputs: a list of per-frame features extracted from MediaPipe Hands.
Output: (label, confidence) or (None, 0.0) if nothing confident matches.

Supported signs (initial vocabulary):
  - oi              (waving an open hand)
  - tchau           (same shape, larger lateral movement)
  - sim             (closed fist nodding up-down)
  - nao             (index finger shaking side-to-side)
  - obrigado        (open hand touching chin, moving forward)
  - por favor       (open hand circular on chest)
  - bom             (thumbs up)
  - ruim            (thumbs down)

These rules are deliberately loose: calibrate thresholds once you have real
users and replace with a learned model.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Optional, Tuple


@dataclass
class HandFrame:
    """Per-frame hand features extracted from MediaPipe Hands landmarks."""

    present: bool
    # Normalised landmark coords (x, y in [0, 1])
    landmarks: List[Tuple[float, float]]
    # Simple derived flags:
    fingers_up: Tuple[bool, bool, bool, bool, bool]  # thumb, index, middle, ring, pinky
    palm_center: Tuple[float, float]
    handedness: str  # "Left" | "Right" | ""


def _palm_trajectory(frames: List[HandFrame]) -> List[Tuple[float, float]]:
    return [f.palm_center for f in frames if f.present]


def _lateral_range(points: List[Tuple[float, float]]) -> float:
    if not points:
        return 0.0
    xs = [p[0] for p in points]
    return max(xs) - min(xs)


def _vertical_range(points: List[Tuple[float, float]]) -> float:
    if not points:
        return 0.0
    ys = [p[1] for p in points]
    return max(ys) - min(ys)


def _oscillation_count(values: List[float], threshold: float = 0.02) -> int:
    """Counts sign-changes of the derivative — a rough "wave" / "shake" measure."""
    if len(values) < 3:
        return 0
    count = 0
    last_sign = 0
    for i in range(1, len(values)):
        d = values[i] - values[i - 1]
        if abs(d) < threshold:
            continue
        s = 1 if d > 0 else -1
        if s != 0 and s != last_sign and last_sign != 0:
            count += 1
        last_sign = s
    return count


def classify(frames: List[HandFrame]) -> Tuple[Optional[str], float]:
    active = [f for f in frames if f.present]
    if len(active) < 4:
        return (None, 0.0)

    last = active[-1]
    thumb, index, middle, ring, pinky = last.fingers_up
    open_hand = all([index, middle, ring, pinky])
    fist = not any([index, middle, ring, pinky])

    xs = [f.palm_center[0] for f in active]
    ys = [f.palm_center[1] for f in active]

    lat = _lateral_range(_palm_trajectory(active))
    vert = _vertical_range(_palm_trajectory(active))
    lat_osc = _oscillation_count(xs)
    vert_osc = _oscillation_count(ys)

    # --- Wave (oi / tchau) ---
    if open_hand and lat_osc >= 2 and lat > 0.08:
        label = "tchau" if lat > 0.18 else "oi"
        conf = min(0.95, 0.6 + lat)
        return (label, conf)

    # --- Yes / No ---
    if fist and vert_osc >= 2 and vert > 0.05 and lat < 0.04:
        return ("sim", min(0.9, 0.55 + vert * 2))

    if index and not any([middle, ring, pinky]) and lat_osc >= 2 and lat > 0.05:
        return ("não", min(0.9, 0.55 + lat * 2))

    # --- Thumbs up / down ---
    if thumb and not any([index, middle, ring, pinky]):
        # Thumb tip (landmark 4) above wrist (landmark 0) → up, else down.
        tip_y = last.landmarks[4][1] if len(last.landmarks) > 4 else 0.5
        wrist_y = last.landmarks[0][1] if last.landmarks else 0.5
        if tip_y < wrist_y - 0.05:
            return ("bom", 0.8)
        if tip_y > wrist_y + 0.05:
            return ("ruim", 0.8)

    # --- Obrigado (open hand, starts near chin ~y=0.35 and moves forward/down) ---
    if open_hand and ys[0] < 0.45 and ys[-1] > ys[0] + 0.05 and lat < 0.05:
        return ("obrigado", 0.7)

    # --- Por favor (open hand, circular motion on chest area) ---
    if open_hand and 0.3 < sum(ys) / len(ys) < 0.7 and lat_osc >= 2 and vert_osc >= 2:
        dist = math.hypot(lat, vert)
        if 0.05 < dist < 0.25:
            return ("por favor", 0.65)

    return (None, 0.0)
