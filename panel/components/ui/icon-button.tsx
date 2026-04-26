"use client";

import type { ButtonHTMLAttributes, FocusEvent, MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  children: ReactNode;
  label: string;
  /**
   * When set, the button is inert (no activation) but still shows a tooltip and hover.
   * Native `disabled` blocks tooltips in most browsers, so we use aria-disabled.
   */
  disabled?: boolean;
};

function tipPosition(el: HTMLButtonElement) {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + r.width / 2,
    y: r.bottom + 8,
  };
}

/**
 * Icon-only control with a real hover/focus label (portaled so it is not clipped by modal overflow),
 * and `aria-label` for assistive tech. Kept string-only for minimal weight (no extra tooltip lib).
 */
export function IconButton({
  children,
  className = "",
  label,
  type = "button",
  disabled = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  id,
  ...rest
}: IconButtonProps) {
  const isDisabled = Boolean(disabled);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const [xy, setXy] = useState({ x: 0, y: 0 });

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    setXy(tipPosition(btnRef.current));
  }, []);

  const show = useCallback(() => {
    updatePos();
    setOpen(true);
  }, [updatePos]);

  const hide = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = () => {
      hide();
    };
    window.addEventListener("scroll", h, true);
    window.addEventListener("resize", h);
    return () => {
      window.removeEventListener("scroll", h, true);
      window.removeEventListener("resize", h);
    };
  }, [open, hide]);

  const tipText = label;

  return (
    <>
      <button
        ref={btnRef}
        type={type}
        id={id}
        {...rest}
        title={label}
        aria-label={label}
        aria-disabled={isDisabled}
        aria-describedby={open ? tipId : undefined}
        tabIndex={isDisabled ? -1 : undefined}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          if (isDisabled) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          onClick?.(e);
        }}
        onMouseEnter={(e) => {
          onMouseEnter?.(e);
          show();
        }}
        onMouseLeave={(e) => {
          onMouseLeave?.(e);
          hide();
        }}
        onFocus={(e: FocusEvent<HTMLButtonElement>) => {
          onFocus?.(e);
          if (!isDisabled) show();
        }}
        onBlur={(e) => {
          onBlur?.(e);
          hide();
        }}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--fg-muted)] transition-colors ${
          isDisabled
            ? "cursor-not-allowed opacity-50"
            : "hover:bg-[var(--surface)] hover:text-[var(--fg)]"
        } ${className}`}
      >
        {children}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              id={tipId}
              role="tooltip"
              className="pointer-events-none fixed z-[10000] w-max max-w-[min(20rem,calc(100vw-1rem))] rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug text-[var(--fg)] shadow-lg [text-wrap:balance]"
              style={{
                left: xy.x,
                top: xy.y,
                transform: "translateX(-50%)",
              }}
            >
              {tipText}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
