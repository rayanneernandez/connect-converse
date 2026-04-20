import { useCallback, useRef, useState } from "react";
import type { RemoteParticipant } from "./useMeetingPeers";

interface StartOptions {
  email: string;
  localStream: MediaStream | null;
  remotes: RemoteParticipant[];
  screenStream: MediaStream | null;
  localName: string;
  meetingId: string;
}

/**
 * Records the current meeting client-side by composing every participant's
 * video into a single canvas and mixing every audio track (local + remotes).
 * Produces a `.webm` download on stop; the email is used for the user-facing
 * confirmation (a backend hook-up would POST the blob there to actually mail
 * the recording).
 */
export const useMeetingRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [email, setEmail] = useState<string>("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const currentStateRef = useRef<{
    localStream: MediaStream | null;
    remotes: RemoteParticipant[];
    screenStream: MediaStream | null;
    localName: string;
  } | null>(null);

  // Factory that produces the <video> element for a given stream id.
  const getOrCreateVideoEl = (id: string, stream: MediaStream): HTMLVideoElement => {
    const existing = videoElsRef.current.get(id);
    if (existing && existing.srcObject === stream) return existing;
    existing?.pause();
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;
    el.srcObject = stream;
    el.play().catch(() => {
      /* ignore */
    });
    videoElsRef.current.set(id, el);
    return el;
  };

  const removeVideoEl = (id: string) => {
    const el = videoElsRef.current.get(id);
    if (el) {
      el.pause();
      el.srcObject = null;
      videoElsRef.current.delete(id);
    }
  };

  // Attach each audio track once to the shared AudioContext destination.
  const attachAudio = (id: string, stream: MediaStream | null) => {
    if (!stream || !audioCtxRef.current || !audioDestRef.current) return;
    if (audioSourcesRef.current.has(id)) return;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;
    try {
      const src = audioCtxRef.current.createMediaStreamSource(
        new MediaStream(audioTracks)
      );
      src.connect(audioDestRef.current);
      audioSourcesRef.current.set(id, src);
    } catch {
      /* ignore (probably already attached) */
    }
  };

  const detachAudio = (id: string) => {
    const src = audioSourcesRef.current.get(id);
    if (src) {
      try {
        src.disconnect();
      } catch {
        /* ignore */
      }
      audioSourcesRef.current.delete(id);
    }
  };

  /**
   * Updates which streams should be recorded. Safe to call every render; it
   * diffs and only adds/removes the changed participants.
   */
  const syncStreams = useCallback(
    (s: {
      localStream: MediaStream | null;
      remotes: RemoteParticipant[];
      screenStream: MediaStream | null;
      localName: string;
    }) => {
      currentStateRef.current = s;
      if (!isRecording) return;

      // Attach local audio.
      attachAudio("local", s.localStream);

      // Sync remote audio tracks.
      const seen = new Set<string>(["local"]);
      s.remotes.forEach((r) => {
        seen.add(r.id);
        attachAudio(r.id, r.stream ?? null);
      });
      Array.from(audioSourcesRef.current.keys()).forEach((id) => {
        if (!seen.has(id) && id !== "screen") detachAudio(id);
      });
    },
    [isRecording]
  );

  const drawFrame = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const state = currentStateRef.current;
    if (!canvas || !ctx || !state) return;

    const { localStream, remotes, screenStream, localName } = state;

    // Tiles: screen (if any), local, remotes
    type Tile = {
      id: string;
      el: HTMLVideoElement | null;
      label: string;
      isScreen?: boolean;
    };
    const tiles: Tile[] = [];
    if (screenStream && screenStream.getVideoTracks().length > 0) {
      tiles.push({
        id: "screen",
        el: getOrCreateVideoEl("screen", screenStream),
        label: "Tela compartilhada",
        isScreen: true,
      });
    }
    if (localStream) {
      tiles.push({
        id: "local",
        el: getOrCreateVideoEl("local", localStream),
        label: localName || "Você",
      });
    }
    remotes.forEach((r) => {
      if (r.stream && r.stream.getVideoTracks().length > 0) {
        tiles.push({
          id: r.id,
          el: getOrCreateVideoEl(r.id, r.stream),
          label: r.name || "Participante",
        });
      } else {
        tiles.push({ id: r.id, el: null, label: r.name || "Participante" });
      }
    });

    // Clean up video elements for removed participants.
    const activeIds = new Set(tiles.map((t) => t.id));
    Array.from(videoElsRef.current.keys()).forEach((id) => {
      if (!activeIds.has(id)) removeVideoEl(id);
    });

    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#0b0b10";
    ctx.fillRect(0, 0, W, H);

    if (tiles.length === 0) return;

    // Choose a grid layout.
    const cols = tiles.length === 1 ? 1 : tiles.length <= 4 ? 2 : 3;
    const rows = Math.ceil(tiles.length / cols);
    const gap = 8;
    const tileW = (W - gap * (cols + 1)) / cols;
    const tileH = (H - gap * (rows + 1)) / rows;

    tiles.forEach((tile, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gap + col * (tileW + gap);
      const y = gap + row * (tileH + gap);

      // Tile background
      ctx.fillStyle = "#1b1b22";
      roundRect(ctx, x, y, tileW, tileH, 12);
      ctx.fill();

      if (tile.el && tile.el.readyState >= 2) {
        // Fit the video inside the tile, preserving aspect ratio.
        const vw = tile.el.videoWidth || 640;
        const vh = tile.el.videoHeight || 360;
        const scale = Math.min(tileW / vw, tileH / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = x + (tileW - dw) / 2;
        const dy = y + (tileH - dh) / 2;
        ctx.save();
        roundRect(ctx, x, y, tileW, tileH, 12);
        ctx.clip();
        ctx.drawImage(tile.el, dx, dy, dw, dh);
        ctx.restore();
      } else {
        // Placeholder initials
        const initials = tile.label
          .split(" ")
          .map((s) => s[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        ctx.fillStyle = "#2a2a33";
        ctx.beginPath();
        ctx.arc(
          x + tileW / 2,
          y + tileH / 2,
          Math.min(tileW, tileH) / 6,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = `${Math.round(Math.min(tileW, tileH) / 8)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initials || "?", x + tileW / 2, y + tileH / 2);
      }

      // Name label
      const label = tile.label;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const padX = 8;
      const padY = 4;
      ctx.font = "13px system-ui, sans-serif";
      const metrics = ctx.measureText(label);
      const lw = metrics.width + padX * 2;
      const lh = 22;
      roundRect(ctx, x + 8, y + tileH - lh - 8, lw, lh, 6);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 8 + padX, y + tileH - lh / 2 - 8);
    });
  };

  const start = useCallback(
    ({ email: emailArg, localStream, remotes, screenStream, localName, meetingId }: StartOptions) => {
      if (isRecording) return;

      // Canvas output (1280x720)
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      canvasRef.current = canvas;

      currentStateRef.current = { localStream, remotes, screenStream, localName };

      // Audio mixing
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      audioCtxRef.current = audioCtx;
      audioDestRef.current = dest;

      // Pre-attach existing participants (local + remotes + screen audio if any)
      if (localStream) {
        try {
          const src = audioCtx.createMediaStreamSource(
            new MediaStream(localStream.getAudioTracks())
          );
          src.connect(dest);
          audioSourcesRef.current.set("local", src);
        } catch {
          /* ignore */
        }
      }
      remotes.forEach((r) => {
        if (r.stream) {
          const tracks = r.stream.getAudioTracks();
          if (tracks.length) {
            try {
              const src = audioCtx.createMediaStreamSource(new MediaStream(tracks));
              src.connect(dest);
              audioSourcesRef.current.set(r.id, src);
            } catch {
              /* ignore */
            }
          }
        }
      });
      if (screenStream) {
        const tracks = screenStream.getAudioTracks();
        if (tracks.length) {
          try {
            const src = audioCtx.createMediaStreamSource(new MediaStream(tracks));
            src.connect(dest);
            audioSourcesRef.current.set("screen", src);
          } catch {
            /* ignore */
          }
        }
      }

      // Recording stream = canvas video + mixed audio
      const canvasStream = canvas.captureStream(24);
      const recordingStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const mime = pickRecordingMime();
      const recorder = new MediaRecorder(recordingStream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        a.href = url;
        a.download = `gravacao-${meetingId}-${ts}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);

        // Cleanup
        canvasStream.getTracks().forEach((t) => t.stop());
        audioSourcesRef.current.forEach((s) => {
          try {
            s.disconnect();
          } catch {
            /* ignore */
          }
        });
        audioSourcesRef.current.clear();
        audioCtx.close().catch(() => {});
        audioCtxRef.current = null;
        audioDestRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
        videoElsRef.current.forEach((el) => {
          el.pause();
          el.srcObject = null;
        });
        videoElsRef.current.clear();
        if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
        canvasRef.current = null;
      };

      // Drawing loop
      const loop = () => {
        drawFrame();
        rafIdRef.current = requestAnimationFrame(loop);
      };
      loop();

      recorder.start(1000);
      setEmail(emailArg);
      setIsRecording(true);
    },
    [isRecording]
  );

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    setIsRecording(false);
  }, []);

  return { isRecording, email, start, stop, syncStreams };
};

function pickRecordingMime(): string | null {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c))
      return c;
  }
  return null;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
