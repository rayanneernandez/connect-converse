import { useEffect, useRef, useState } from "react";

interface VLibrasGlobal {
  Widget?: {
    new (endpoint: string): unknown;
  };
}

const VLIBRAS_SCRIPT = "https://vlibras.gov.br/app/vlibras-plugin.js";

/**
 * Loads the VLibras widget (https://www.gov.br/governodigital/pt-br/vlibras/)
 * and mounts the Libras avatar in the bottom-right of the page. The widget
 * renders a floating 3D avatar that translates selected text into Brazilian
 * Sign Language.
 *
 * Limitations:
 *  - The public VLibras widget doesn't expose a stable programmatic
 *    "translate this text" API, so real-time auto-sign from speech captions
 *    is not guaranteed. The avatar remains available as an on-screen
 *    accessibility tool so Libras users can select captions and translate.
 *  - Sign-language *recognition* (Libras → text) requires a trained ML model
 *    and is not available in-browser; the UI surfaces this as "em breve".
 */
export const useVLibras = (enabled: boolean) => {
  const [ready, setReady] = useState(false);
  const scriptInjectedRef = useRef(false);
  const widgetMountedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    // Inject the widget markup VLibras expects (only once).
    if (!widgetMountedRef.current) {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("vw", "");
      wrapper.className = "enabled";
      wrapper.innerHTML = `
        <div vw-access-button class="active"></div>
        <div vw-plugin-wrapper>
          <div class="vw-plugin-top-wrapper"></div>
        </div>
      `;
      document.body.appendChild(wrapper);
      widgetMountedRef.current = true;
    }

    // Inject the widget script + bootstrap (only once per page life).
    if (!scriptInjectedRef.current) {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${VLIBRAS_SCRIPT}"]`
      );
      const onLoad = () => {
        try {
          const v = (window as unknown as { VLibras?: VLibrasGlobal }).VLibras;
          if (v?.Widget) {
            new v.Widget("https://vlibras.gov.br/app");
          }
        } catch {
          /* ignore */
        }
        setReady(true);
      };
      if (existing) {
        existing.addEventListener("load", onLoad);
        // Script may already be loaded from a previous mount.
        if ((window as unknown as { VLibras?: VLibrasGlobal }).VLibras) onLoad();
      } else {
        const s = document.createElement("script");
        s.src = VLIBRAS_SCRIPT;
        s.async = true;
        s.addEventListener("load", onLoad);
        document.head.appendChild(s);
      }
      scriptInjectedRef.current = true;
    }

    return () => {
      /* Widget persists across remounts — toggling captions off shouldn't
         tear down the injected assets. */
    };
  }, [enabled]);

  return { ready };
};
