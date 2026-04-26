const ORDER_LETTERS = new Set(["i", "e", "o", "n", "p", "r"]);

/** Allowed single-letter field codes in remark model order (after separator). */
export const REMARK_ORDER_LETTERS = ["i", "e", "o", "n", "p", "r"] as const;
export type RemarkOrderLetter = (typeof REMARK_ORDER_LETTERS)[number];

/** Strips invalid characters; preserves order (duplicates allowed). */
export function parseOrderLetters(order: string): RemarkOrderLetter[] {
  const out: RemarkOrderLetter[] = [];
  for (const c of Array.from((order ?? "").toLowerCase())) {
    if (ORDER_LETTERS.has(c)) out.push(c as RemarkOrderLetter);
  }
  return out;
}

/** First grapheme = separator, rest = order template (i/e/o/n/p/r). */
export function parseRemarkModelUi(model: string): { sep: string; order: string } {
  const m = (model ?? "").trim();
  if (!m) {
    return { sep: "-", order: "ieo" };
  }
  const g = Array.from(m);
  return { sep: g[0] ?? "-", order: g.slice(1).join("") };
}

/** Rebuilds stored value: one separator + allowed order letters. */
export function buildRemarkModel(sep: string, order: string): string {
  const first = Array.from(sep || "-")[0] ?? "-";
  const o = Array.from((order || "").toLowerCase())
    .filter((c) => ORDER_LETTERS.has(c))
    .join("");
  return first + o;
}

/** Demo line for the settings help (mimics subscription display name). */
export function formatRemarkModelPreview(remarkModel: string): string {
  const m = (remarkModel || "-ieo").trim() || "-ieo";
  const sep = Array.from(m)[0] ?? "-";
  const order = m ? Array.from(m).slice(1).join("") : "ieo";
  const part = (c: string): string | null => {
    switch (c) {
      case "i":
        return "NL-UK";
      case "e":
        return "user@mail";
      case "o":
        return "x";
      case "n":
        return "n1";
      case "p":
        return "10.0.0.1";
      case "r":
        return "443";
      default:
        return null;
    }
  };
  const out: string[] = [];
  for (const c of order) {
    if (!ORDER_LETTERS.has(c)) continue;
    const s = part(c);
    if (s) out.push(s);
  }
  return out.join(sep);
}
