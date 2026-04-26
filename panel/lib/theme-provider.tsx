/** Must match PANEL_THEME_STORAGE_KEY in @/lib/panelTheme (kept local to avoid server importing hooks). */
const PANEL_THEME_STORAGE_KEY = "sharx.panel.theme";

/** Default panel accent (CSS :root; static fallbacks). */
export const DEFAULT_PANEL_ACCENT = "#22d3ee";
export const DEFAULT_PANEL_SECONDARY = "#9775fa";

const META: Record<string, string> = {
  default: "#0d1117",
  midnight: "#0a1628",
  ember: "#140f0c",
  boreal: "#0a1412",
  web: "#05060a",
  xuiClassic: "#0a1222",
};

/**
 * Early paint: dark mode + panel palette from localStorage.
 * Accents come from globals.css / [data-panel-theme] (no inline --accent).
 */
export const themeInitScript = `
(function() {
  try {
    var key = ${JSON.stringify(PANEL_THEME_STORAGE_KEY)};
    var root = document.documentElement;
    var meta = ${JSON.stringify(META)};
    root.setAttribute("data-theme", "dark");
    var stored = localStorage.getItem(key);
    var panelThemeId;
    if (stored === "default") {
      panelThemeId = null;
    } else if (stored === "midnight" || stored === "ember" || stored === "boreal" || stored === "web" || stored === "xuiClassic") {
      panelThemeId = stored;
    } else {
      panelThemeId = "web";
    }
    if (panelThemeId) {
      root.setAttribute("data-panel-theme", panelThemeId);
    } else {
      root.removeAttribute("data-panel-theme");
    }
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) {
      var colorKey = panelThemeId || "default";
      m.setAttribute("content", meta[colorKey] || meta["default"]);
    }
  } catch (e) {}
})();
`;
