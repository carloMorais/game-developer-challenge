import type { ReactNode } from 'react';
import { MuteToggle } from '../components/MuteToggle';

/** Full-screen menu backdrop (scene art) with the sound toggle in the corner. */
export function ScreenLayout({ children }: { children: ReactNode }) {
  return (
    <main className="screen">
      <div className="screen__corner">
        <MuteToggle />
      </div>
      {children}
    </main>
  );
}
