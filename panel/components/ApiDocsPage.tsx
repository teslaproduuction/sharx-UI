"use client";

import { BookOpen, FileCode2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { Spinner } from "@/components/ui";

type TocItem = { id: string; text: string; level: number };

/** Only `##` sections — skip `###` endpoints/methods and the main `h1` title. */
function collectToc(root: HTMLElement): TocItem[] {
  const hs = root.querySelectorAll("h2");
  const out: TocItem[] = [];
  hs.forEach((h) => {
    const id = h.id;
    if (!id) return;
    const text = (h.textContent ?? "").trim();
    if (!text) return;
    out.push({ id, text, level: 2 });
  });
  return out;
}

export function ApiDocsPage() {
  const { t } = useTranslation();
  const [md, setMd] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const tocTitle = t("apiDocsTocTitle", { defaultValue: "On this page" });

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const u = panel("api/api-docs/markdown");
        const r = await fetch(u, { credentials: "include" });
        if (!r.ok) {
          setError(`${r.status} ${r.statusText}`);
          setMd("");
          return;
        }
        const text = await r.text();
        setMd(text);
      } catch (e) {
        setError(e instanceof Error ? e.message : "fetch failed");
        setMd("");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useLayoutEffect(() => {
    if (!md) {
      setToc([]);
      return;
    }
    const root = scrollRef.current;
    if (!root) return;
    setToc(collectToc(root));
  }, [md]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || toc.length === 0) {
      setActiveId(null);
      return;
    }
    const ids = toc.map((item) => item.id);
    const update = () => {
      const rootTop = scrollEl.getBoundingClientRect().top;
      let current = ids[0];
      for (const id of ids) {
        let node: Element | null = null;
        try {
          node = scrollEl.querySelector(`#${CSS.escape(id)}`);
        } catch {
          node = document.getElementById(id);
        }
        if (!node || !scrollEl.contains(node)) continue;
        const r = node.getBoundingClientRect();
        if (r.top - rootTop <= 16) current = id;
      }
      setActiveId(current);
    };
    update();
    scrollEl.addEventListener("scroll", update, { passive: true });
    return () => scrollEl.removeEventListener("scroll", update);
  }, [toc]);

  const scrollToHeading = (id: string) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    let node: Element | null = null;
    try {
      node = scrollEl.querySelector(`#${CSS.escape(id)}`);
    } catch {
      node = document.getElementById(id);
    }
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <PageScaffold compact>
      <PageHeader
        eyebrow="HTTP"
        title={t("menu.apiDocs")}
        accentTitle
        description={t("menu.apiDocsDesc")}
        icon={BookOpen}
        iconTone="neutral"
      />
      <Surface padding="md">
        {loading ? (
          <div className="grid min-h-[40vh] place-items-center">
            <Spinner size={40} />
          </div>
        ) : error ? (
          <p className="text-sm text-[var(--fg-muted)]">
            {t("apiDocsLoadError", { defaultValue: "Could not load documentation." })} ({error})
          </p>
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            <nav
              className="shrink-0 lg:sticky lg:top-4 lg:w-56 lg:self-start"
              aria-label={tocTitle}
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
                {tocTitle}
              </p>
              <div className="max-h-[min(30vh,260px)] overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-2 lg:max-h-[min(78vh,calc(100dvh-9rem))] lg:border-0 lg:bg-transparent lg:p-0">
                {toc.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-[var(--fg-muted)]">—</p>
                ) : (
                  <ul className="space-y-0.5 border-l border-[var(--border)] pl-3">
                    {toc.map((item) => {
                      const indent = Math.max(0, item.level - 2) * 12;
                      const active = activeId === item.id;
                      return (
                        <li key={item.id} style={{ paddingLeft: indent }}>
                          <a
                            href={`#${item.id}`}
                            className={`block rounded-sm py-0.5 text-sm leading-snug transition-colors ${
                              active
                                ? "font-medium text-[var(--accent)]"
                                : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                            }`}
                            onClick={(e) => {
                              e.preventDefault();
                              scrollToHeading(item.id);
                            }}
                          >
                            {item.text}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </nav>
            <div
              ref={scrollRef}
              className="prose-doc max-h-[min(78vh,calc(100dvh-9rem))] min-h-[40vh] min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
                {md}
              </ReactMarkdown>
            </div>
          </div>
        )}
        {!loading && !error && (
          <p className="mt-4 flex items-center gap-2 text-xs text-[var(--fg-subtle)]">
            <FileCode2 className="size-3.5 shrink-0 opacity-80" />
            {t("info")}
          </p>
        )}
      </Surface>
    </PageScaffold>
  );
}
