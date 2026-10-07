import type { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  wide?: boolean;
  className?: string;
  labelledBy?: string;
}

/** Wooden framed panel (9-slice of the pack's `panel_menu`). */
export function Panel({ children, wide = false, className = '', labelledBy }: PanelProps) {
  return (
    <section
      className={`panel ${wide ? 'panel--wide' : ''} ${className}`}
      aria-labelledby={labelledBy}
    >
      <div className="panel__content">{children}</div>
    </section>
  );
}
