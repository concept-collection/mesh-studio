/**
 * Loads the OpenCASCADE WASM runtime exactly once and caches the promise.
 *
 * We deliberately bypass the package's `index.js` wrapper: it does a bare
 * `import ... from "./opencascade.full.wasm"`, which a URL-based bundler (Vite /
 * rolldown) cannot resolve. Instead we import the Emscripten factory directly
 * and hand it the wasm URL through `locateFile` — the `?url` import makes Vite
 * emit the ~30 MB wasm as a static asset, fetched lazily on first use.
 */
import ocFactory from 'opencascade.js/dist/opencascade.full.js'
import wasmUrl from 'opencascade.js/dist/opencascade.full.wasm?url'
import type { OpenCascade } from './types'

type Factory = (module: { locateFile: (path: string) => string }) => Promise<OpenCascade>

let cached: Promise<OpenCascade> | null = null

export function loadOpenCascade(onStatus?: (msg: string) => void): Promise<OpenCascade> {
  if (cached) return cached
  onStatus?.('Loading CAD engine (OpenCASCADE, ~30 MB)…')
  const factory = ocFactory as unknown as Factory
  cached = factory({
    locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path),
  })
    .then((oc: OpenCascade) => {
      onStatus?.('CAD engine ready')
      return oc
    })
    .catch((e: unknown) => {
      cached = null // allow a retry on the next action
      throw e
    })
  return cached
}

/** True once the runtime has finished loading in this session. */
export function isLoaded(): boolean {
  return cached !== null
}
