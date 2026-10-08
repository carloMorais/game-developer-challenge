/**
 * Fullscreen + landscape lock for the battle on phones. Every call is
 * best effort: a refusal (iOS, desktop, no user gesture) never blocks play.
 */

interface WebkitElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface WebkitDocument {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
}

interface LockableOrientation {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
}

export const COARSE_POINTER_QUERY = '(pointer: coarse)';

/** True when the browser lets this page go fullscreen at all. */
export function canFullscreen(doc: Document = document): boolean {
  const el = doc.documentElement as Element & WebkitElement;
  const enabled =
    doc.fullscreenEnabled || (doc as Document & WebkitDocument).webkitFullscreenEnabled;
  return (
    !!enabled &&
    (typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function')
  );
}

export function isFullscreen(doc: Document = document): boolean {
  return !!(doc.fullscreenElement ?? (doc as Document & WebkitDocument).webkitFullscreenElement);
}

/** Must run inside a user gesture (click handler). Resolves true on success. */
export async function enterFullscreen(doc: Document = document): Promise<boolean> {
  if (!canFullscreen(doc) || isFullscreen(doc)) return isFullscreen(doc);
  const el = doc.documentElement as Element & WebkitElement;
  try {
    if (typeof el.requestFullscreen === 'function') {
      await el.requestFullscreen({ navigationUI: 'hide' });
    } else {
      await el.webkitRequestFullscreen?.();
    }
  } catch {
    return false;
  }
  // Orientation lock only works in fullscreen, and only on some browsers (Android).
  try {
    await (screen.orientation as ScreenOrientation & LockableOrientation).lock?.('landscape');
  } catch {
    // Unsupported (iOS, desktop): the rotate overlay remains the fallback.
  }
  return true;
}

export async function exitFullscreen(doc: Document = document): Promise<void> {
  if (!isFullscreen(doc)) return;
  try {
    (screen.orientation as ScreenOrientation & LockableOrientation).unlock?.();
  } catch {
    // Nothing locked.
  }
  try {
    if (typeof doc.exitFullscreen === 'function') await doc.exitFullscreen();
    else await (doc as Document & WebkitDocument).webkitExitFullscreen?.();
  } catch {
    // Already left (system back gesture).
  }
}

/** Subscribes to fullscreen changes (standard and WebKit); returns the unsubscriber. */
export function onFullscreenChange(listener: () => void, doc: Document = document): () => void {
  doc.addEventListener('fullscreenchange', listener);
  doc.addEventListener('webkitfullscreenchange', listener);
  return () => {
    doc.removeEventListener('fullscreenchange', listener);
    doc.removeEventListener('webkitfullscreenchange', listener);
  };
}

/** Set while the battle itself put the page in fullscreen. */
let enteredForBattle = false;

/**
 * Battle start (Set sail / Play again click): go fullscreen on touch devices
 * when the player allows it. Fullscreen needs this user gesture, so it cannot
 * move into an effect.
 */
export function autoEnterFullscreen(allowed: boolean): void {
  if (!allowed || !window.matchMedia(COARSE_POINTER_QUERY).matches || isFullscreen()) return;
  enteredForBattle = true;
  void enterFullscreen().then((ok) => {
    if (!ok) enteredForBattle = false;
  });
}

/** Back on the menus: leave the fullscreen the battle entered (not one the player chose). */
export function exitBattleFullscreen(): void {
  if (!enteredForBattle) return;
  enteredForBattle = false;
  void exitFullscreen();
}
