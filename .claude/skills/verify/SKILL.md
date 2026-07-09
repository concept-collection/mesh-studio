---
name: verify
description: Build, launch, and drive mesh-studio headlessly to verify a change at the browser surface (WebGL renders fine under headless Chrome + SwiftShader).
---

# Verifying mesh-studio

`npm run build` only gates TS + bundling. The real surface is the browser
(OCCT WASM + three.js WebGL), and it works headlessly:

1. `npm run dev -- --port 5199 --strictPort` (background).
2. Drive with playwright-core (install it in the scratchpad, not the repo)
   using system Chrome — WebGL needs the SwiftShader flags:

   ```js
   chromium.launch({
     executablePath: '/usr/bin/google-chrome',
     headless: true,
     args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
   })
   ```

3. Cheapest end-to-end flow (no network): click the "Box" primitive button.
   That triggers the ~50 MB OCCT WASM load (local, a few seconds) — wait for
   `.view-overlay` to appear and `.busy` to disappear, then screenshot.
   "Random CAD model" additionally exercises the network import path.

## Gotchas

- Rendering is deterministic — byte-identical screenshots across runs means
  your change did NOT take effect, not that it's stable.
- To pixel-check the canvas, screenshot the `.viewport canvas` locator and
  analyze in-page via a 2D canvas; `gl.readPixels` returns blanks because the
  renderer doesn't preserve the drawing buffer.
- Face picking: click the canvas center and look for a sidebar `h2` matching
  `Face #`.
- `node_modules` reads are permission-denied here; inspect library behavior at
  runtime (temporary `console.log` in app code + a page that captures console)
  instead of reading vendored source.
