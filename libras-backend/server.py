"""
FastAPI server exposing a WebSocket endpoint at /libras that accepts JPEG
frames and emits recognised Libras text back to the client.

Protocol
--------
Client → server (after opening the socket):
  - First (optional) text frame: JSON {"type":"hello","fps":3}
  - Following frames: raw JPEG bytes (binary messages), one per webcam frame.

Server → client:
  - JSON text frames of shape
      {"type":"libras","id":"xxx","text":"oi","confidence":0.88,"final":true}

Design
------
The server keeps a rolling window of per-frame features (hand landmarks) per
connection and runs the rule-based classifier on that window. Recognised
signs are debounced: once the server emits "oi" for a hand, it won't emit
the same label again until the hand leaves the frame or changes pose.

Replace the simple rule-based classifier in classifier.py with a trained
model when you're ready — the plumbing here doesn't change.
"""

from __future__ import annotations

import asyncio
import collections
import json
import logging
import uuid
from typing import Deque, Optional

import cv2
import mediapipe as mp
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from classifier import HandFrame, classify

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("libras")

app = FastAPI(title="Libras recognition")

# Allow the Vite dev server (and any localhost port) to open WebSockets here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mp_hands = mp.solutions.hands
# Fingertip and PIP landmark indices used to decide "finger up".
FINGER_TIPS = (4, 8, 12, 16, 20)
FINGER_PIPS = (3, 6, 10, 14, 18)

# How many frames to keep per connection — roughly 2s at 3fps.
WINDOW_SIZE = 18
# Minimum confidence before we emit a recognition.
MIN_CONF = 0.55


def _extract_features(
    landmarks, handedness: str, frame_shape
) -> HandFrame:
    lms = [(lm.x, lm.y) for lm in landmarks.landmark]
    palm_x = sum(lms[i][0] for i in (0, 5, 9, 13, 17)) / 5.0
    palm_y = sum(lms[i][1] for i in (0, 5, 9, 13, 17)) / 5.0

    # Finger up test: fingertip is above its PIP joint for non-thumb. Thumb
    # uses lateral position relative to the IP joint.
    fingers: list[bool] = []
    # Thumb (compare x since orientation varies)
    thumb_tip_x = lms[FINGER_TIPS[0]][0]
    thumb_ip_x = lms[FINGER_PIPS[0]][0]
    if handedness == "Right":
        fingers.append(thumb_tip_x < thumb_ip_x)
    else:
        fingers.append(thumb_tip_x > thumb_ip_x)
    # Other four fingers
    for tip, pip in zip(FINGER_TIPS[1:], FINGER_PIPS[1:]):
        fingers.append(lms[tip][1] < lms[pip][1])

    return HandFrame(
        present=True,
        landmarks=lms,
        fingers_up=(fingers[0], fingers[1], fingers[2], fingers[3], fingers[4]),
        palm_center=(palm_x, palm_y),
        handedness=handedness,
    )


@app.get("/health")
def health():
    return {"ok": True}


@app.websocket("/libras")
async def libras_ws(ws: WebSocket):
    await ws.accept()
    window: Deque[HandFrame] = collections.deque(maxlen=WINDOW_SIZE)
    last_emitted: Optional[str] = None
    last_emitted_at: float = 0.0
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.5,
    )
    log.info("client connected")
    try:
        while True:
            msg = await ws.receive()
            # Text frames are protocol hints; binary frames are JPEG data.
            if "text" in msg and msg["text"] is not None:
                try:
                    payload = json.loads(msg["text"])
                    log.info("hello from client: %s", payload)
                except Exception:  # noqa: BLE001
                    pass
                continue
            data = msg.get("bytes")
            if not data:
                continue

            arr = np.frombuffer(data, dtype=np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame is None:
                continue
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = hands.process(rgb)

            if result.multi_hand_landmarks:
                lm = result.multi_hand_landmarks[0]
                handedness = "Right"
                if result.multi_handedness:
                    handedness = result.multi_handedness[0].classification[0].label
                window.append(_extract_features(lm, handedness, rgb.shape))
            else:
                window.append(
                    HandFrame(
                        present=False,
                        landmarks=[],
                        fingers_up=(False, False, False, False, False),
                        palm_center=(0.5, 0.5),
                        handedness="",
                    )
                )

            label, confidence = classify(list(window))
            now = asyncio.get_event_loop().time()

            should_emit = (
                label is not None
                and confidence >= MIN_CONF
                and (label != last_emitted or now - last_emitted_at > 3.0)
            )
            if should_emit:
                last_emitted = label
                last_emitted_at = now
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "libras",
                            "id": uuid.uuid4().hex[:10],
                            "text": label,
                            "confidence": round(confidence, 3),
                            "final": True,
                        }
                    )
                )
                log.info("emitted: %s (%.2f)", label, confidence)
    except WebSocketDisconnect:
        log.info("client disconnected")
    except Exception:  # noqa: BLE001
        log.exception("ws error")
    finally:
        hands.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
