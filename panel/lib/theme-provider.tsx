/** Remnawave docs — --ifm-color-primary / secondary (single dark scheme) */
export const REMNA_ACCENT = "#22d3ee";
export const REMNA_SECONDARY = "#9775fa";

export const themeInitScript = `
(function() {
  try {
    var root = document.documentElement;
    root.setAttribute("data-theme", "dark");
    root.removeAttribute("data-palette");
    root.style.setProperty("--accent", "${REMNA_ACCENT}");
    root.style.setProperty("--accent-ambient", "${REMNA_SECONDARY}");
  } catch (e) {}
})();
`;
