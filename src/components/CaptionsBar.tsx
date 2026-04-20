import { useEffect, useRef } from "react";

export interface CaptionEntry {
  id: string;
  speaker: string;
  text: string;
  lang: string; // "PT" | "EN" | "ES"
  type: "speech" | "libras";
  final: boolean;
  // If set, this entry was produced by translating from `sourceLang` to `lang`.
  sourceLang?: string;
}

interface CaptionsBarProps {
  captions: CaptionEntry[];
  isVisible: boolean;
  librasEnabled?: boolean;
  librasSourceText?: string | null;
  librasSignAvailable?: boolean;
}

const LANG_LABEL: Record<string, string> = {
  PT: "PT",
  EN: "EN",
  ES: "ES",
};

const CaptionsBar = ({
  captions,
  isVisible,
  librasEnabled = false,
  librasSourceText = null,
  librasSignAvailable = false,
}: CaptionsBarProps) => {
  // Ref used by VLibras to position its avatar.
  const vlibrasTargetRef = useRef<HTMLDivElement>(null);

  // Keep the last 3 captions in view so the user has context.
  const latest = captions.slice(-3);

  // Push new text to the VLibras widget whenever a caption arrives.
  useEffect(() => {
    if (!librasEnabled || !librasSourceText) return;
    const w = window as unknown as {
      VLibras?: {
        translate?: (text: string) => void;
      };
    };
    try {
      w.VLibras?.translate?.(librasSourceText);
    } catch {
      /* ignore — VLibras may still be initializing */
    }
  }, [librasEnabled, librasSourceText]);

  if (!isVisible && !librasEnabled) return null;

  return (
    <div className="w-full px-4 py-2 flex flex-col items-center gap-2 flex-shrink-0">
      {isVisible && latest.length > 0 && (
        <div className="max-w-3xl w-full flex flex-col items-center gap-1">
          {latest.map((c) => (
            <div
              key={`${c.id}-${c.final ? "f" : "i"}-${c.lang}`}
              className={`flex items-center gap-2 max-w-full rounded-full px-3 py-1.5 text-sm ${
                c.final
                  ? "bg-black/60 text-white"
                  : "bg-black/35 text-white/90 italic"
              }`}
            >
              <span className="inline-flex items-center justify-center rounded-full bg-primary/90 text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 shrink-0">
                {c.sourceLang && c.sourceLang !== c.lang
                  ? `${LANG_LABEL[c.sourceLang] ?? c.sourceLang}→${LANG_LABEL[c.lang] ?? c.lang}`
                  : LANG_LABEL[c.lang] ?? c.lang}
              </span>
              <span className="truncate">
                <span className="text-white/70 font-medium">{c.speaker}:</span>{" "}
                {c.text}
                {c.sourceLang && c.sourceLang !== c.lang && (
                  <span className="text-white/50 text-[10px] ml-1">
                    (traduzido)
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {librasEnabled && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div
            ref={vlibrasTargetRef}
            aria-hidden
            // VLibras injects its avatar into a fixed-position iframe on the
            // page; this marker div just gives us a predictable anchor.
            className="sr-only"
          />
          <span>
            {librasSignAvailable
              ? "Avatar em Libras ativo (canto inferior direito)"
              : "Carregando avatar em Libras…"}
          </span>
        </div>
      )}
    </div>
  );
};

export default CaptionsBar;
