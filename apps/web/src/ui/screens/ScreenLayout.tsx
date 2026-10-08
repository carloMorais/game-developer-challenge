import type { ReactNode } from 'react';
import { FullscreenToggle } from '../components/FullscreenToggle';
import { MuteToggle } from '../components/MuteToggle';

/** Full-screen menu backdrop (scene art) with the sound and fullscreen toggles in the corner. */
export function ScreenLayout({ children }: { children: ReactNode }) {
  return (
    <main className="screen">
      <div className="screen__corner">
        <FullscreenToggle />
        <MuteToggle />
      </div>
      {children}
    </main>
  );
}
