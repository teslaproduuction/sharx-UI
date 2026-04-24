import type { ReactNode } from "react";

type PageScaffoldProps = {
  children: ReactNode;
  /** Tighter vertical rhythm for dense lists */
  compact?: boolean;
};

/**
 * Fluid desktop container with safe side paddings.
 */
export function PageScaffold({ children, compact }: PageScaffoldProps) {
  return (
    <div
      className={`mx-auto w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 ${
        compact
          ? "space-y-4 pt-3 pb-2 sm:pt-4 sm:pb-3 lg:pt-5 lg:pb-4"
          : "space-y-8 pt-4 pb-3 sm:pt-5 sm:pb-4 lg:pt-6 lg:pb-5"
      }`}
    >
      {children}
    </div>
  );
}
