import { useEffect, useMemo, useRef, useState } from "react";
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

// Segmentation runs at most this many times per second — the visible canvas
// still refreshes at full video framerate so the image never freezes. 15 fps
// is imperceptible for head movement and significantly reduces CPU pressure
// (the bottleneck when the user is also recording the meeting).
const SEG_FPS = 15;

/**
 * Produces a processed MediaStream with (optional) person-aware background
 * blur and/or color filter. When both effects are "none", the original stream
 * is passed through unchanged.
 *
 * Audio tracks from the source stream are preserved on the output so the
 * caller can use the result directly in WebRTC / MediaRecorder.
 *
 * Performance notes:
 *  - The canvas and the output MediaStream are created synchronously, so the
 *    output is never "black" while waiting for MediaPipe to load.
 *  - While MediaPipe is still downloading we draw filter-only frames so the
 *    preview is smooth from the first tick.
 *  - Segmentation uses the lite model (selection 0) and is capped at SEG_FPS,
 *    which dramatically reduces jank vs. running it at every animation frame.
 *  - The pipeline is only torn down when the source stream changes or when the
 *    user switches between "any effect on" and "no effects at all". Switching
 *    between different backgrounds / filters reuses the pipeline (via refs).
 */
export const useProcessedStream = (
  source: MediaStream | null,
  background: BackgroundMode,
  filter: FilterMode
): MediaStream | null => {
  const [output, setOutput] = useState<MediaStream | null>(null);

  // Refs let the render loop pick up the latest settings without recreating
  // MediaPipe / the canvas every time the user toggles.
  const backgroundRef = useRef(background);
  const filterRef = useRef(filter);
  useEffect(() => {
    backgroundRef.current = background;
  }, [background]);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  // Pipeline only needs to exist when at least one effect is selected.
  const needsPipeline = useMemo(
    () => background !== "none" || filter !== "none",
    [background, filter]
  );

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

    // Fast path: no effects at all — just forward the original stream.
    if (!needsPipeline) {
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
    let segmentationReady = false;
    let segmentationLoading = false;
    let lastResults: Results | null = null;

    // Prime the canvas with a solid frame right away so the MediaStream never
    // produces a "black" first video frame while the video element is still
    // warming up.
    outCtx.fillStyle = "#0b0b10";
    outCtx.fillRect(0, 0, width, height);

    const canvasStream = outCanvas.captureStream(30);
    source.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
    setOutput(canvasStream);

    const drawFilterOnly = () => {
      const fxCss = filterCss(filterRef.current);
      outCtx.save();
      outCtx.clearRect(0, 0, width, height);
      outCtx.filter = fxCss;
      outCtx.drawImage(video, 0, 0, width, height);
      outCtx.restore();
    };

    const drawSegmented = (results: Results) => {
      const bg = backgroundRef.current;
      const fxCss = filterCss(filterRef.current);
      const blurAmount = BACKGROUND_BLUR_PX[bg];

      outCtx.save();
      outCtx.clearRect(0, 0, width, height);

      if (bg !== "none") {
        // 1) Blurred background covering the full frame (+ color filter).
        outCtx.filter =
          fxCss === "none"
            ? `blur(${blurAmount}px)`
            : `blur(${blurAmount}px) ${fxCss}`;
        outCtx.drawImage(results.image, 0, 0, width, height);

        // 2) Sharp person layer isolated with the mask.
        personCtx.save();
        personCtx.clearRect(0, 0, width, height);
        personCtx.drawImage(results.segmentationMask, 0, 0, width, height);
        personCtx.globalCompositeOperation = "source-in";
        personCtx.drawImage(results.image, 0, 0, width, height);
        personCtx.restore();

        // 3) Overlay the sharp person on top of the blurred background.
        outCtx.filter = fxCss;
        outCtx.drawImage(personCanvas, 0, 0, width, height);
      } else {
        // Background disabled but filter still on — just draw the frame.
        outCtx.filter = fxCss;
        outCtx.drawImage(results.image, 0, 0, width, height);
      }

      outCtx.restore();
    };

    const loadSegmentation = () => {
      if (segmentation || segmentationLoading) return;
      segmentationLoading = true;
      (async () => {
        try {
          const mod = await import("@mediapipe/selfie_segmentation");
          if (disposed) return;
          const instance = new mod.SelfieSegmentation({
            locateFile: (file: string) => `${MP_CDN}/${file}`,
          });
          // modelSelection 0 is the lite model — much faster with barely any
          // visual cost for webcam-distance framing.
          instance.setOptions({ modelSelection: 0 });
          instance.onResults((results: Results) => {
            if (disposed) return;
            lastResults = results;
            segmentationReady = true;
          });
          segmentation = instance;
        } catch (err) {
          console.warn(
            "[useProcessedStream] failed to load MediaPipe — continuing with filter-only",
            err
          );
        } finally {
          segmentationLoading = false;
        }
      })();
    };

    // Kick the segmentation inference at a capped frame rate. This runs on a
    // timer (not rAF) so the visible redraw loop can still run at full speed.
    let segInFlight = false;
    let segTimerId: ReturnType<typeof setInterval> | null = null;
    const startSegTimer = () => {
      if (segTimerId != null) return;
      segTimerId = setInterval(async () => {
        if (disposed) return;
        if (!segmentation || segInFlight || video.readyState < 2) return;
        if (backgroundRef.current === "none") return;
        segInFlight = true;
        try {
          await segmentation.send({ image: video });
        } catch {
          /* ignore */
        } finally {
          segInFlight = false;
        }
      }, Math.round(1000 / SEG_FPS));
    };
    const stopSegTimer = () => {
      if (segTimerId != null) {
        clearInterval(segTimerId);
        segTimerId = null;
      }
    };

    // Main render loop. Always runs at rAF cadence; composites using the most
    // recent segmentation mask when a background effect is selected, or draws
    // filter-only otherwise.
    const loop = () => {
      if (disposed) return;
      if (video.readyState >= 2) {
        const bg = backgroundRef.current;

        if (bg !== "none") {
          // Need segmentation — load it on first need.
          if (!segmentation && !segmentationLoading) {
            loadSegmentation();
          }
          // Until the first result arrives, keep the preview smooth by
          // drawing a filter-only frame instead of a black canvas.
          if (segmentationReady && lastResults) {
            drawSegmented(lastResults);
          } else {
            drawFilterOnly();
          }
          startSegTimer();
        } else {
          // No background effect — color filter only. Don't waste CPU on
          // segmentation but keep the instance loaded in case the user turns
          // background back on.
          stopSegTimer();
          drawFilterOnly();
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    video.play().catch(() => {
      /* ignore autoplay errors */
    });
    loop();

    return () => {
      disposed = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = null;
      stopSegTimer();
      try {
        segmentation?.close();
      } catch {
        /* ignore */
      }
      segmentation = null;
      canvasStream.getVideoTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [source, needsPipeline]);

  return output;
};
