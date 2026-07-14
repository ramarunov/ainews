"use client";

import { useEffect, useRef } from "react";

interface AdSlotValue {
  enabled?: boolean;
  html?: string;
}

/**
 * Renders a raw ad-network HTML/script snippet configured by a superadmin
 * (see the "Ad Widgets" section of the System Settings page).
 *
 * `dangerouslySetInnerHTML` does NOT execute <script> tags in the string it
 * inserts — browsers deliberately ignore script tags created via innerHTML,
 * for the same reason innerHTML is otherwise considered safe-ish. To make
 * an arbitrary third-party ad tag actually run, each <script> found in the
 * snippet is re-created via document.createElement('script') (copying
 * src/inline text) and appended for real, inside a plain DOM container
 * ref'd outside React's own render tree — this is the standard technique
 * for "raw HTML ad slot" widgets.
 */
export function AdSlot({ value, className }: { value: AdSlotValue | null | undefined; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !value?.enabled || !value.html) return;

    container.innerHTML = value.html;

    const scripts = Array.from(container.querySelectorAll("script"));
    for (const oldScript of scripts) {
      const newScript = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes)) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    }

    return () => {
      container.innerHTML = "";
    };
  }, [value?.enabled, value?.html]);

  if (!value?.enabled || !value.html) return null;

  return <div ref={containerRef} className={className} data-ad-slot />;
}
