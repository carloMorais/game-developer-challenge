import { useRef, type ReactNode } from 'react';
import { Panel } from './Panel';
import { useFocusTrap } from './useFocusTrap';

interface DialogProps {
  titleId: string;
  children: ReactNode;
  describedBy?: string;
}

/** Modal dialog over the game: traps focus and restores it when closed. */
export function Dialog({ titleId, describedBy, children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <div className="dialog-backdrop">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        className="dialog"
      >
        <Panel>{children}</Panel>
      </div>
    </div>
  );
}
