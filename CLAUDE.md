# CLAUDE.md

Tips for future agents working in this repo.

## Architecture

```
src/occ/       ALL OpenCASCADE.js access lives here. The rest of the app never
               touches OCCT — it only sees the SurfaceModel from src/model.
  loader.ts      initOpenCascade({ mainWasm: wasmUrl }) once; wasm imported with
                 `?url` so Vite emits it as a static asset. Lazy on first use.
  primitives.ts  BRepPrimAPI_* builders returning TopoDS_Shape.
  importCad.ts   STEP/IGES via FS.createDataFile + STEPControl_Reader/IGESControl_Reader.
  exportCad.ts   STEPControl_Writer -> bytes.
  extract.ts     shape -> SurfaceModel. Runs BRepMesh (triangulation, always) and
                 BRepBuilderAPI_NurbsConvert + Geom_BSplineSurface reads (per-face,
                 best-effort). retessellate() re-meshes at a new quality reusing NURBS.
src/model/     types.ts: SurfaceModel = list of Patch (discriminated union).
               v1 emits `nurbs` patches. tessellate.ts: pure geometry helpers
               (modelBounds, controlNet, mergeTriMeshes) — no three, no OCCT.
src/render/    SurfaceView.tsx: plain three.js, one mesh per patch (for picking),
               modes shaded/wire/net/iso. palette.ts: per-face colors.
src/export/    meshWriters.ts (OBJ/PLY/STL, dependency-free), nurbsJson.ts.
src/App.tsx    sidebar + viewport; keeps the OpenCascade instance and the
               (NURBS-converted) mesh shape in refs for re-tessellation.
src/abcDataset.ts  "Random CAD model" source: fetches index.json from
               https://concept-collection.github.io/abc-step-1000/ (first 1000
               ABC-dataset STEP files, gzip-served), picks a random file ≤2 MB,
               gunzips via DecompressionStream, hands bytes to importCadFile.
```

## Key gotchas

- **OCCT is typed as `any`** (`src/occ/types.ts`). opencascade.js ships a huge
  generated `.d.ts`, and the overload-suffixed member names (`_1`, `_2`, …) are
  only verifiable at runtime. Keep all OCCT calls in `src/occ/*`; everything
  else is strictly typed against `SurfaceModel`. The **build gate is `tsc -b &&
  vite build`** — runtime correctness of OCCT calls must be checked in a real
  browser (`npm run dev`).
- **opencascade.js is pinned to the beta** (`2.0.0-beta.b5ff984`). `latest`
  (1.1.1) is an older, different API. Overload suffixes and the `?url` wasm
  recipe follow the beta and its examples (donalffons/opencascade.js-examples).
- **NURBS extraction is best-effort.** Rendering only needs the BRepMesh
  triangulation, which always runs. `extractNurbs` is wrapped in try/catch per
  face and returns null on any failure; the sidebar shows "N/M faces" coverage.
  If a binding is missing in the build, coverage drops but the app still works.
- **Mesh density uses BRepMesh relative mode** (`isRelative = true`), so the
  quality slider is a dimensionless fraction independent of model scale — no
  bounding-box computation needed. `retessellate` calls `BRepTools.Clean` first
  (in a try/catch) so a finer deflection actually refines.
- **The "Sample STEP" button** round-trips a box through `shapeToStep` +
  `importCadFile` — it exercises the whole STEP export+import pipeline with no
  bundled asset, and is the quickest end-to-end check of the CAD path.

## Verification

Browser is the real verification surface (WASM). `npm run build` confirms TS +
bundling (including the OCCT wasm asset). Then `npm run dev` and:
- load each primitive; toggle shaded / wireframe / control-net / isocurves;
- drag the resolution slider (faceting should visibly change);
- click a face → the inspector shows degree / poles / knots;
- "Sample STEP" and a real uploaded STEP/IGES both render;
- "Random CAD model" downloads from abc-step-1000 and renders (needs that
  Pages site up, and the network);
- export OBJ/PLY/STL/NURBS-JSON/STEP.

Not yet deployed to the org Pages site (same procedure as mesh-converter /
mesh-pde-solver when ready).
