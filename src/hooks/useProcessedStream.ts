import { useEffect, useRef, useState } from "react";
import type { Results, SelfieSegmentation } from "@mediapipe/selfie_segmentation";

export type BackgroundMode = "none" | "blur" | "heavy-blur";
export type FilterMode =
  | "none"
  | "warm"
  | "cool"
  | "vivid"
  | "grayscale"
  | "sepia";

const BACKGROUND_BLUR_PX: Record<BackgroundMode, number> = {
  none: 0,
  blur: 10,
  "heavy-blur": 22,
};

const FILTER_CSS: Record<FilterMode, string> = {
  none: "none",
  warm: "saturate(1.25) contrast(1.05) brightness(1.03) hue-rotate(-8deg)",
  cool: "saturate(1.15) contrast(1.05) brightness(0.98) hue-rotate(10deg)",
  vivid: "saturate(1.6) contrast(1.1)",
  grayscale: "grayscale(1) contrast(1.05)",
  sepia: "sepia(0.75) saturate(1.1)",
};

export const filterCss = (mode: FilterMode) => FILTER_CSS[mode] ?? "none";
export const backgroundLabel: Record<BackgroundMode, string> = {
  none: "Sem fundo",
  blur: "Desfocar fundo",
  "heavy-blur": "Desfocar forte",
};

// MediaPipe selfie_segmentation version that matches the installed package.
const MP_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747";

/**
 * Produces a processed MediaStream with (optional) person-aware background
 * blur and/or color filter. When both effects are "none", the original stream
 * is passed through unchanged.
 *
 * Audio tracks from the source stream are preserved on the output so the
 * caller can use the result directly in WebRTC / MediaRecorder.
 */
export const useProcessedStream = (
  source: MediaStream | null,
  background: BackgroundMode,
  filter: FilterMode
): MediaStream | null => {
  const [output, setOutput] = useState<MediaStream | null>(null);

  // Stash the current effect values so the render loop can pick them up
  // without having to re-create MediaPipe every time the user toggles something.
  const backgroundRef = useRef(background);
  const filterRef = useRef(filter);
  useEffect(() => {
    backgroundRef.current = background;
  }, [background]);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    if (!source) {
      setOutput(null);
      return;
    }
    const videoTrack = source.getVideoTracks()[0];
    if (!videoTrack) {
      setOutput(source);
      return;
    }

    // Fast path: no effects at all.
    if (background === "none" && filter === "none") {
      setOutput(source);
      return;
    }

    const settings = videoTrack.getSettings();
    const width = settings.width ?? 1280;
    const height = settings.height ?? 720;

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = source;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    const outCtx = outCanvas.getContext("2d");

    // Offscreen canvas used to isolate the "person" layer with the mask.
    const personCanvas = document.createElement("canvas");
    personCanvas.width = width;
    personCanvas.height = height;
    const personCtx = personCanvas.getContext("2d");

    if (!outCtx || !personCtx) {
      setOutput(source);
      return;
    }

    let disposed = false;
    let rafId: number | null = null;
    let segmentation: SelfieSegmentation | null = null;

    const canvasStream = outCanvas.captureStream(30);
    source.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
    setOutput(canvasStream);

    const draw = (image: CanvasImageSource, mask?: CanvasImageSource) => {
      const bg = backgroundRef.current;
      const fx = filterRef.current;
      const blurAmount = BACKGROUND_BLUR_PX[bg];
      const fxCss = filterCss(fx);

      outCtx.save();
      outCtx.clearRect(0, 0, width, height);

      if (bg !== "none" && mask) {
        // 1) Blurred background covering the full frame (plus color filter).
        outCtx.filter =
          fxCss === "none"
            ? `blur(${blurAmount}px)`
            : `blur(${blurAmount}px) ${fxCss}`;
        outCtx.drawImage(image, 0, 0, width, height);

        // 2) Prepare sharp person layer using the mask on an offscreen canvas.
        personCtx.save();
        personCtx.clearRect(0, 0, width, height);
        personCtx.drawImage(mask, 0, 0, width, height);
        personCtx.globalCompositeOperation = "source-in";
        personCtx.drawImage(image, 0, 0, width, height);
        personCtx.restore();

        // 3) Overlay the person on top of the blurred background.
        outCtx.filter = fxCss;
        outCtx.drawImage(personCanvas, 0, 0, width, height);
      } else {
        // No background effect — just apply color filter (if any) to the frame.
        outCtx.filter = fxCss;
        outCtx.drawImage(image, 0, 0, width, height);
      }

      outCtx.restore();
    };

    const startWithoutSegmentation = () => {
      const loop = () => {
        if (disposed) return;
        if (video.readyState >= 2) {
          draw(video);
        }
        rafId = requestAnimationFrame(loop);
      };
      loop();
    };

    const startWithSegmentation = async () => {
      try {
        const mod = await import("@mediapipe/selfie_segmentation");
        if (disposed) return;
        const SelfieSegmentation = mod.SelfieSegmentation;
        segmentation = new SelfieSegmentation({
          locateFile: (file: string) => `${MP_CDN}/${file}`,
        });
        segmentation.setOptions({ modelSelection: 1 });
        segmentation.onResults((results: Results) => {
          if (disposed) return;
          draw(results.image, results.segmentationMask);
        });

        // Feed frames to MediaPipe at ~24fps. `send` is async; if it takes
        // longer than one frame the next tick just skips.
        let sending = false;
        const tick = async () => {
          if (disposed) return;
          if (!sending && video.readyState >= 2 && segmentation) {
            sending = true;
            try {
              await segmentation.send({ image: video });
            } catch {
              /* ignore */
            }
            sending = false;
          }
          rafId = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        console.warn("[useProcessedStream] segmentation failed, falling back to filter-only", err);
        startWithoutSegmentation();
      }
    };

    const play = () =>
      video.play().catch(() => {
        /* ignore autoplay errors */
      });
    play();

    if (background !== "none") {
      startWithSegmentation();
    } else {
      startWithoutSegmentation();
    }

    return () => {
      disposed = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = null;
      try {
        segmentation?.close();
      } catch {
        /* ignore */
      }
      segmentation = null;
      canvasStream.getVideoTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [source, background, filter]);

  return output;
};
