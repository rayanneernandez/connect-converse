import { useEffect, useRef } from "react";

export type CaptionLangCode = "PT" | "EN" | "ES";

const LANG_BCP47: Record<CaptionLangCode, string> = {
  PT: "pt-BR",
  EN: "en-US",
  ES: "es-ES",
};

interface CaptionEvent {
  id: string;
  lang: CaptionLangCode;
  text: string;
  final: boolean;
}

interface Options {
  enabled: boolean;
  lang: CaptionLangCode | null;
  isMicOn: boolean;
  onCaption: (c: CaptionEvent) => void;
  onStatus?: (s: SRStatus) => void;
}

export type SRStatus =
  | { kind: "unsupported" }
  | { kind: "idle" }
  | { kind: "listening" }
  | { kind: "error"; error: string };

/* Web Speech API — lib.dom types aren't consistently available across TS
   versions, so we describe the shape we use directly. */
interface SRResultAlt {
  transcript: string;
  confidence: number;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [index: number]: SRResultAlt;
}
interface SRResultList {
  length: number;
  [index: number]: SRResult;
}
interface SRResultEvent {
  resultIndex: number;
  results: SRResultList;
}
interface SRInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SRResultEvent) => void) | null;
  onend: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRConstructor = new () => SRInstance;

// The browser exposes either `SpeechRecognition` or (Chrome) `webkitSpeechRecognition`.
const getSR = (): SRConstructor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/**
 * Runs the browser's SpeechRecognition on the local mic and fires a callback
 * with interim + final transcripts. Caller is responsible for broadcasting the
 * caption event to other peers and rendering locally.
 *
 * Only one language can be active at a time (Web Speech API limitation). The
 * user picks a primary caption language which drives recognition — remote
 * peers broadcast their own captions in whatever language they set, and a
 * caller that has e.g. "PT" + "EN" enabled will simply *display* both streams
 * of captions as they arrive.
 */
export const useSpeechCaptions = ({
  enabled,
  lang,
  isMicOn,
  onCaption,
  onStatus,
}: Options) => {
  const recRef = useRef<SRInstance | null>(null);
  const onCaptionRef = useRef(onCaption);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onCaptionRef.current = onCaption;
  }, [onCaption]);
  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);
  const utteranceIdRef = useRef<string>("");
  const wantRunningRef = useRef(false);

  useEffect(() => {
    const SR = getSR();
    if (!SR) {
      // Browser doesn't support the API — tell the UI so it can warn the user.
      onStatusRef.current?.({ kind: "unsupported" });
      return;
    }
    if (!enabled || !lang || !isMicOn) {
      wantRunningRef.current = false;
      recRef.current?.stop();
      onStatusRef.current?.({ kind: "idle" });
      return;
    }

    wantRunningRef.current = true;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = LANG_BCP47[lang];
    recRef.current = rec;

    const newUtterance = () => {
      utteranceIdRef.current =
        Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    };
    newUtterance();

    rec.onresult = (event: SRResultEvent) => {
      // Walk the results from the first not-yet-final index, concatenate and
      // emit one event per utterance (final vs interim).
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0]?.transcript ?? "";
        if (res.isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      if (interim.trim()) {
        onCaptionRef.current({
          id: utteranceIdRef.current,
          lang,
          text: interim.trim(),
          final: false,
        });
      }
      if (finalText.trim()) {
        onCaptionRef.current({
          id: utteranceIdRef.current,
          lang,
          text: finalText.trim(),
          final: true,
        });
        newUtterance();
      }
    };

    rec.onerror = (e: Event) => {
      // "no-speech" / "aborted" are normal while the mic is idle.
      const err = (e as unknown as { error?: string }).error;
      if (err && err !== "no-speech" && err !== "aborted") {
        console.warn("[useSpeechCaptions] error", err);
        onStatusRef.current?.({ kind: "error", error: err });
      }
    };

    rec.onend = () => {
      // Chrome terminates continuous recognition periodically. Auto-restart
      // while the caller still wants captions enabled.
      if (wantRunningRef.current) {
        try {
          rec.start();
          onStatusRef.current?.({ kind: "listening" });
        } catch {
          /* already started */
        }
      } else {
        onStatusRef.current?.({ kind: "idle" });
      }
    };

    try {
      rec.start();
      onStatusRef.current?.({ kind: "listening" });
    } catch (err) {
      console.warn("[useSpeechCaptions] start failed", err);
      onStatusRef.current?.({ kind: "error", error: String(err) });
    }

    return () => {
      wantRunningRef.current = false;
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    };
  }, [enabled, lang, isMicOn]);
};

// SpeechRecognition types ship with lib.dom — no ambient declarations needed.
