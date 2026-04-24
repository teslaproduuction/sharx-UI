/**
 * Copies text to the clipboard. Works over plain HTTP: we try the legacy
 * synchronous copy first (same tick as the click = valid user activation).
 * Awaiting the Clipboard API before fallback breaks that on many browsers.
 */
function tryExecCommandCopy(text: string): boolean {
  if (typeof document === "undefined" || !document.body) {
    return false;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "0";
  ta.style.top = "0";
  ta.style.width = "1px";
  ta.style.height = "1px";
  ta.style.opacity = "0";
  ta.style.padding = "0";
  ta.setAttribute("aria-hidden", "true");
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
  return ok;
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  if (tryExecCommandCopy(text)) {
    return;
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // e.g. permission — try exec one more time
    }
  }
  if (tryExecCommandCopy(text)) {
    return;
  }
  throw new Error("copy failed");
}
