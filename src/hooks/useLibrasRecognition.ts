import { useEffect, useRef } from "react";

interface LibrasEvent {
  id: string;
  text: string;
  confidence: number;
  final: boolean;
}

interface Options {
  enabled: boolean;
  localStream: MediaStream | null;
  serverUrl: string; // e.g. "ws://localhost:8000/libras"
  onRecognized: (e: LibrasEvent) => void;
  onStatus?: (s: "idle" | "connecting" | "connected" | "error") => void;
  fps?: number; // default 3
}

/**
 * Captures frames from the local camera at low fps, JPEG-encodes them and
 * sends them over a WebSocket to a backend that runs Libras sign recognition.
 * The backend is expected to reply with messages of the shape:
 *   { id: string, text: string, confidence: number, final: boolean }
 *
 * The hook is a best-effort client — if the server is down, it backs off
 * and retries so the meeting UI keeps working without captions.
 */
export const useLibrasRecognition = ({
  enabled,
  localStream,
  serverUrl,
  onRecognized,
  onStatus,
  fps = 3,
}: Options) => {
  const onRecognizedRef = useRef(onRecognized);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onRecognizedRef.current = onRecognized;
  }, [onRecognized]);
  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    if (!enabled || !localStream || !serverUrl) {
      onStatusRef.current?.("idle");
      return;
    }
    const track = localStream.getVideoTracks()[0];
    if (!track) {
      onStatusRef.current?.("idle");
      return;
    }

    let closed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let frameTimer: ReturnType<typeof setInterval> | null = null;

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = localStream;
    video.play().catch(() => {
      /* ignore */
    });

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");

    const sendFrame = () => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !ctx) return;
      if (video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob || !ws || ws.readyState !== WebSocket.OPEN) return;
          blob.arrayBuffer().then((buf) => {
            try {
              ws?.send(buf);
            } catch {
              /* ignore */
            }
          });
        },
        "image/jpeg",
        0.6
      );
    };

    const connect = () => {
      if (closed) return;
      onStatusRef.current?.("connecting");
      try {
        ws = new WebSocket(serverUrl);
      } catch {
        onStatusRef.current?.("error");
        scheduleReconnect();
        return;
      }
      ws.binaryType = "arraybuffer";

      ws.addEventListener("open", () => {
        onStatusRef.current?.("connected");
        // Tell the backend about the frame rate so it can tune buffers.
        try {
          ws?.send(JSON.stringify({ type: "hello", fps }));
        } catch {
          /* ignore */
        }
        frameTimer = setInterval(sendFrame, Math.round(1000 / fps));
      });

      ws.addEventListener("message", (ev) => {
        try {
          const payload = JSON.parse(
            typeof ev.data === "string" ? ev.data : ""
          );
          if (payload && payload.type === "libras" && payload.text) {
            onRecognizedRef.current({
              id: payload.id ?? Math.random().toString(36).slice(2),
              text: String(payload.text),
              confidence: Number(payload.confidence ?? 0),
              final: Boolean(payload.final ?? true),
            });
          }
        } catch {
          /* ignore non-JSON frames */
        }
      });

      ws.addEventListener("close", () => {
        if (frameTimer) {
          clearInterval(frameTimer);
          frameTimer = null;
        }
        onStatusRef.current?.("idle");
        scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        onStatusRef.current?.("error");
      });
    };

    const scheduleReconnect = () => {
      if (closed) return;
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 3000);
    };

    connect();

    return () => {
      closed = true;
      if (frameTimer) clearInterval(frameTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      try {
        video.pause();
        video.srcObject = null;
      } catch {
        /* ignore */
      }
    };
  }, [enabled, localStream, serverUrl, fps]);
};
