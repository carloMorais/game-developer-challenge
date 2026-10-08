# Credits and licenses

## Game assets

Everything in [`assets/`](assets/) was provided with the challenge by Jungle Gaming ([`junglegaming/game-developer-challenge`](https://github.com/junglegaming/game-developer-challenge)) and is used here unmodified: ships, ship parts, projectiles, effects, tiles, UI sprites and atlases, the menu background, reference images and the WAV sounds.

- **Ship and tile art:** the file names, sheet layouts and art style (`ships_miscellaneous_sheet`, `tiles_sheet`, 64×64 tiles, `ship_1`…`ship_24` in six colours × four damage states) match the **Pirate Pack by Kenney** ([kenney.nl/assets/pirate-pack](https://kenney.nl/assets/pirate-pack)), released under **CC0 1.0 Universal** (public domain). The provided material carries no license file or attribution, so this origin is an identification, not a statement from the asset provider.
- **UI atlas (`ui_sheet*.json/png`), menu background and sounds:** the provided material does not state their source or license. They are used as supplied by the challenge, for the purpose of the challenge.
- `assets/logo_jungle_gaming.svg` and the `sample*.png` / `preview.png` reference images belong to Jungle Gaming and are not used by the game.

### Derived files

`apps/web/scripts/build-assets.mjs` generates the runtime files in `apps/web/public/game/` (not versioned) from `assets/`:

- the ships' Starling/Sparrow XML atlas converted to a PixiJS JSON atlas;
- a JSON grid atlas for the 64×64 tilesheet (1× and @2x);
- the UI atlas JSON re-pointed at the copied images (1× and @2x);
- the player ship sprite (`ship_5.png`) copied as the favicon;
- copies of the individual UI PNGs (1× and 2×) used by the CSS menus, the sounds and the menu background.

The installable-app icons in `apps/web/public/icons/` (192, 512, maskable 512 and the 180 px Apple touch icon) are the only derived images: the same `ship_5.png` drawn once, rotated, over a navy gradient, and saved as committed PNGs.

Apart from those icons, no image or sound was edited, re-encoded or optimised. The provided "retina" ship sheet is identical in size and coordinates to the 1× sheet, so only the 1× sheet is used.

Two particle textures (a soft dot and a ring) are generated at runtime; everything else on screen, health bars included, comes from the provided atlases. Fonts are system fonts (`Trebuchet MS`, `Segoe UI`, `system-ui`); no font files are bundled.

## Software

Runtime dependencies bundled into the published build:

| Package                                             | License |
| --------------------------------------------------- | ------- |
| React, React DOM                                    | MIT     |
| PixiJS                                              | MIT     |
| @tanstack/react-query                               | MIT     |
| Axios                                               | MIT     |
| Zustand                                             | MIT     |
| MSW (and its service worker `mockServiceWorker.js`) | MIT     |

Development tooling: Vite (MIT), TypeScript (Apache-2.0), Playwright (Apache-2.0), Vitest (MIT), ESLint (MIT), typescript-eslint (MIT), Prettier (MIT), Fastify (MIT, server skeleton only). The full dependency tree with exact versions is in `pnpm-lock.yaml`.
