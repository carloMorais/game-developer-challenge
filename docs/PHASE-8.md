# Phase 8: Mobile & release hardening

Status: done. Branch: `phase-8/mobile-hardening` (from `main`).
Primary test device: **Android Chrome** (no iPhone available; iOS behaviour is best effort).

## Goals

1. Battle runs fullscreen on mobile, locked to landscape where the browser allows it.
2. Touch buttons are larger and translucent, laid over the arena instead of in side gutters.
3. HUD never hides enemies: HUD elements fade when a ship is underneath.
4. Dialogs and screens fit a landscape phone (≈ 360–420 px tall) with little or no scrolling.
5. Difficulty cards become a horizontal carousel on narrow/short screens.
6. Release checks: re-profile, tighten visual tolerance, Lighthouse + a11y pass, verify the deploy.

## Decisions (agreed with the user)

| Topic       | Decision                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| Fullscreen  | Automatic on **Set sail** (and Play again) on touch devices; exit when leaving the battle; a toggle button too |
| PWA         | Yes, installable web app (manifest + icons). **No app store publishing**; "Add to Home screen" only            |
| Controls    | Keep the existing buttons (no joystick): bigger, translucent, overlaid                                         |
| HUD overlap | Option B: compact HUD on mobile **and** fade any HUD element that has a ship underneath                        |
| Popups      | Redesign for short screens so most dialogs need no scroll; sticky action row where scrolling is unavoidable    |
| Difficulty  | Horizontal scroll-snap carousel for the cards on mobile                                                        |

## 1. Fullscreen and orientation

- New `apps/web/src/lib/fullscreen.ts`: `enterFullscreen()`, `exitFullscreen()`, `isFullscreen()`, `canFullscreen()`; feature-detect `requestFullscreen` and `webkitRequestFullscreen`; every call is wrapped in try/catch and never blocks starting a match.
- After entering fullscreen, try `screen.orientation.lock('landscape')` (Android only; ignore rejection).
- Trigger from the click handler of **Set sail** / **Play again** (fullscreen needs a user gesture; it cannot be called from an effect). Only when `(pointer: coarse)` matches and the new setting allows it.
- Exit fullscreen when the battle route unmounts for the menu (Leave, Main menu from result). Keep it across Play again.
- Listen to `fullscreenchange`: if the user leaves fullscreen (system back gesture), do not pause or re-enter automatically; just update the toggle button.
- Toggle button next to the sound button (`RoundButton`), visible only when `canFullscreen()`. Accessible label "Enter fullscreen" / "Exit fullscreen".
- Settings: add `autoFullscreen: boolean` (default `true`) to `settingsStore`, shown in Options → Battle column only on touch devices.
- The portrait "rotate your device" overlay stays as the fallback when orientation lock is unavailable (iOS, desktop browsers).

### PWA (installable, no store)

- `apps/web/public/manifest.webmanifest`: name, short_name "Pirate Battle", `display: "fullscreen"`, `orientation: "landscape"`, `background_color`/`theme_color` `#1b2a3a`, `start_url: "/"`, icons 192 and 512 (+ maskable).
- Icons must be **committed** (e.g. `apps/web/public/icons/`), not under `public/game/` (generated, gitignored). Generate them from the existing favicon / logo art in the asset pipeline or check them in as PNGs; note the source in `CREDITS`/README.
- `<link rel="manifest">`, `apple-mobile-web-app-capable`, `apple-touch-icon` in `index.html`.
- No service worker of our own: MSW already registers `mockServiceWorker.js` at the root scope. Do **not** add an offline caching worker in this phase (it would conflict with MSW's scope). Chrome's install criteria no longer require a fetch handler; verify the install prompt appears on Android.

## 2. Touch controls overlay

Files: `ui/game/TouchControls.tsx`, `ui/game/touchLayout.ts`, `ui/game/GameScreen.tsx` (line ~126 uses `TOUCH_GUTTER`), `styles.css` (`.touch-controls`, `.touch-cluster`, `.touch-btn`, `@media (max-height: 520px)` block).

- Remove the side gutters: the arena uses the full screen on touch devices too (`insets` become `NO_INSETS`, or a small bottom inset only if needed). Remove `TOUCH_GUTTER` if unused.
- Keep the same buttons and layout (movement cluster bottom-left, fire cluster bottom-right) and the per-pointer capture logic.
- Size: visual ≈ 72–80 px (`clamp()` on `vmin`), hit area ≥ 88 px via padding/pseudo-element; gaps so neighbouring buttons are not hit by accident.
- Translucency: idle `opacity ≈ 0.35` with a soft backdrop, pressed `≈ 0.85` + scale feedback; icons keep contrast (outline/shadow).
- Fade further (≈ 0.15) when the **player's** ship is under a cluster: reuse the overlap check from §3.
- Respect safe-area insets (already used in the CSS).
- Update docs: ARCHITECTURE "Canvas fitting" paragraph mentions the gutters.

## 3. HUD overlap (fade under ships)

- Compact mobile HUD (`ui/game/Hud.tsx`, `.hud*` CSS under the short-screen media query): smaller bars/counters, less padding, slightly translucent background.
- Overlap fade: each frame (or at the HUD's 10 Hz), compare HUD element rects with ship screen positions.
  - Add to `GameSession` a cheap way to get ship positions in **screen (CSS) pixels**: e.g. `getShipScreenRects(): {x,y,r}[]` using the current viewport transform (`fitViewport`), or a callback alongside `onHud`.
  - Cache HUD element rects (`ResizeObserver` / on resize), not `getBoundingClientRect` every frame.
  - When a ship circle intersects an element rect (with margin), set `data-obscured="true"` on it → CSS `opacity: 0.25; transition: opacity 150ms`.
  - Applies to: health bar, score, timer, pause button, touch clusters. The pause button stays tappable while faded.
- Keep it in the render loop side, not in `game-core`. No React re-render per frame: toggle attributes directly via refs.

## 4. Dialogs and screens on short screens

Target: landscape phone 844×390 and 740×360 (Android Chrome; the Playwright mobile project).

- **No scroll**: menu, pause, Leave/Discard confirmations, get-ready, result.
- **Scroll allowed** (with sticky header and sticky action row): Options, Captain's Log (ranking/history), setup if the How to play is open.
- Common `@media (max-height: 520px)` tokens: smaller panel padding, title size, gaps, button height (keep ≥ 44 px touch targets).
- Result: two columns on short screens (grade + unlock + actions | report card).
- Options: the two columns already exist; keep them side by side on landscape phones; ship preview smaller; Save/Back in a sticky footer.
- How to play: collapsed by default on touch devices (still remembers the player's choice).
- `Dialog.tsx`: `max-height: 100dvh` minus safe areas, body scrolls, footer sticky.

## 5. Difficulty carousel

File: `ui/screens/DifficultyScreen.tsx` (`.setup-card*`), `styles.css`.

- On mobile/short screens, the cards container becomes `display: flex; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain`, each card `scroll-snap-align: center`, fixed width (≈ 70–80 % of the panel so the next card peeks).
- Custom card (with the pencil) is the last slide; the separator becomes spacing.
- On open, scroll the selected card into view (`scrollIntoView({ inline: 'center', block: 'nearest' })`).
- Keep it a radio group: arrow keys move selection and scroll the card into view; hidden scrollbar is fine but add edge fade / small dots indicator so it reads as scrollable.
- Desktop layout unchanged.

## 6. Release hardening

- Re-run the 3-minute profiling and 5-cycle memory run (`docs/PERFORMANCE.md`), update the numbers (phase 7 added ship parts, smoke, castaways).
- Lower `maxDiffPixelRatio` in `playwright.config.ts` (currently 0.01; a stale result baseline slipped through). Try 0.002 with `threshold` tuned; make sure win32 + linux both pass.
- Lighthouse (mobile) on the deployed build: performance, a11y, best practices, PWA installability. Fix real findings.
- A11y pass on the phase-7/8 UI: ship designer, confirmations, carousel, fullscreen button.
- Verify the Vercel deploy: manifest served with the right MIME type, icons, MSW worker, audio preload.

## Tests

- E2E (mobile project): touch controls overlay (no gutters, buttons ≥ 72 px, translucent), fullscreen requested on Set sail (stub `requestFullscreen` in the page and assert it was called; headless cannot really go fullscreen), carousel scroll/selection, dialogs fit 844×390 without scroll (`scrollHeight <= clientHeight` for the listed dialogs), HUD element gets `data-obscured` when a ship is positioned under it (use the existing test hooks to place a ship).
- Unit: overlap helper (rect vs circle), fullscreen helper feature detection.
- Visual baselines: arena-mobile, result-mobile, menu-mobile, setup-mobile change. Regenerate win32 (`pnpm -C apps/web e2e:update`) and linux (Docker: `pnpm e2e:docker`, then `docker desktop stop`). Look at them before accepting.
- Manual: Android Chrome on the deployed preview: fullscreen + lock, install to home screen, controls feel, dialogs.

## Docs to update

README (controls, mobile, install), ARCHITECTURE (canvas fitting without gutters, HUD fade, fullscreen/PWA), PLAN (phase 8 row), PERFORMANCE (new numbers).
