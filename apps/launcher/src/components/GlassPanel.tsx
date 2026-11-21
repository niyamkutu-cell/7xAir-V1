import type { CSSProperties, ReactNode } from "react";

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  subtle?: boolean;
  style?: CSSProperties;
}

export function GlassPanel({
  children,
  className = "",
  interactive = false,
  subtle = false,
  style,
}: GlassPanelProps) {
  const baseClass = subtle ? "glass-panel--subtle" : "glass-panel";
  const interactiveClass = interactive ? "glass-panel--interactive" : "";
  return (
    <section
      className={`${baseClass} ${interactiveClass} ${className}`.trim()}
      style={style}
    >
      {children}
    </section>
  );
}
