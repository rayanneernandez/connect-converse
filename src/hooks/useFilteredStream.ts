import { useEffect, useRef, useState } from "react";

export type FilterMode =
  | "none"
  | "blur"
  | "heavy-blur"
  | "grayscale"
  | "sepia"
  | "warm"
  | "cool"
  | "vivid";

const FILTER_CSS: Record<FilterMode, string> = {
  none: "none",
  blur: "blur(8px)",
  "heavy-blur": "blur(18px)",
  grayscale: "grayscale(1) contrast(1.05)",
  sepia: "sepia(0.75) saturate(1.1)",
  warm: "saturate(1.25) contrast(1.05) brightness(1.03) hue-rotate(-8deg)",
  cool: "saturate(1.15) contrast(1.05) brightness(0.98) hue-rotate(10deg)",
  vivid: "saturate(1.6) contrast(1.1)",
};

export const filterCss = (mode: FilterMode) => FILTER_CSS[mode] ?? "none";

/**
 * Returns a MediaStream derived from `source` with the requested CSS filter
 * applied via canvas. The resulting stream carries the original audio tracks
 * so it can be used directly in WebRTC / MediaRecorder.
 *
 * When `mode === "none"` the original stream is returned as-is so no extra
 * rendering cost is incurred.
 */
export const useFilteredStream = (
  source: MediaStream | null,
  mode: FilterMode
): MediaStream | null => {
  const [output, setOutput] = useState<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const outStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // If no source or no effect, just pass through.
    if (!source || mode === "none") {
      setOutput(source);
      return;
    }

    const videoTrack = source.getVideoTracks()[0];
    if (!videoTrack) {
      setOutput(source);
      return;
    }

    const settings = videoTrack.getSettings();
    const width = settings.width ?? 1280;
    const height = settings.height ?? 720;

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = source;
    video.autoplay = true;
    videoElRef.current = video;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvasRef.current = canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setOutput(source);
      return;
    }

    let disposed = false;
    const start = () => {
      video.play().catch(() => {
        /* autoplay might be blocked, retry once after interaction */
      });
      const render = () => {
        if (disposed) return;
        if (video.readyState >= 2) {
          ctx.filter = filterCss(mode);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        rafRef.current = requestAnimationFrame(render);
      };
      render();
    };

    start();

    const canvasStream = (canvas as HTMLCanvasElement).captureStream(30);
    // Carry audio over.
    source.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
    outStreamRef.current = canvasStream;
    setOutput(canvasStream);

    return () => {
      disposed = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      // Only stop the video tracks we created; keep the audio tracks alive since
      // they belong to the original source stream.
      canvasStream.getVideoTracks().forEach((t) => t.stop());
      video.srcObject = null;
      videoElRef.current = null;
      canvasRef.current = null;
      outStreamRef.current = null;
    };
  }, [source, mode]);

  return output;
};
