/**
 * Lightweight caption translator backed by the MyMemory public API.
 *
 * We intentionally don't use a paid key here — MyMemory is rate-limited but
 * fine for captions (5k chars/day anon, plenty for dev/testing). If the call
 * fails for any reason we fall back to the original text so the UI stays
 * functional.
 *
 * Results are cached in-memory per `(source → target, text)` pair so we
 * don't re-translate the same interim string twice while a caption is
 * being refined.
 */

type LangShort = "pt" | "en" | "es";

const cache = new Map<string, string>();
// Limit concurrent requests so the API doesn't rate-limit us.
let inFlight = 0;
const MAX_INFLIGHT = 3;
const queue: (() => void)[] = [];

const waitTurn = () =>
  new Promise<void>((resolve) => {
    const tryRun = () => {
      if (inFlight < MAX_INFLIGHT) {
        inFlight++;
        resolve();
      } else {
        queue.push(tryRun);
      }
    };
    tryRun();
  });

const releaseTurn = () => {
  inFlight--;
  const next = queue.shift();
  if (next) next();
};

export const toShortLang = (code: string): LangShort | null => {
  const c = code.toUpperCase();
  if (c === "PT") return "pt";
  if (c === "EN") return "en";
  if (c === "ES") return "es";
  return null;
};

export async function translateText(
  text: string,
  sourceLang: LangShort,
  targetLang: LangShort
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (sourceLang === targetLang) return text;

  const key = `${sourceLang}>${targetLang}:${trimmed}`;
  const cached = cache.get(key);
  if (cached) return cached;

  await waitTurn();
  try {
    const url =
      `https://api.mymemory.translated.net/get?q=` +
      encodeURIComponent(trimmed) +
      `&langpair=${sourceLang}|${targetLang}`;
    const res = await fetch(url);
    if (!res.ok) return text;
    const data = (await res.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number;
    };
    const translated = data?.responseData?.translatedText;
    if (
      typeof translated === "string" &&
      translated.length > 0 &&
      // MyMemory sometimes echoes the input when it can't translate.
      translated.toLowerCase() !== trimmed.toLowerCase()
    ) {
      cache.set(key, translated);
      return translated;
    }
  } catch (err) {
    console.warn("[translate] failed", err);
  } finally {
    releaseTurn();
  }
  return text;
}
