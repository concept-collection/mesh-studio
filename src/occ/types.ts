/**
 * The OpenCASCADE WASM instance.
 *
 * opencascade.js ships a generated `.d.ts` for the entire OCCT API, but the
 * exact overload-suffixed member names (`_1`, `_2`, …) are only verifiable at
 * runtime, and the surface is huge. We therefore type the instance loosely and
 * keep *all* OCCT access confined to `src/occ/*`. Everything outside this
 * directory is fully typed against the `SurfaceModel` in `src/model`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpenCascade = any

/** An OCCT `TopoDS_Shape` (opaque to the rest of the app). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Shape = any
