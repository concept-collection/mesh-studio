# mesh-studio

A browser playground for **producing surface meshes with different tools and
inspecting them interactively in 3D** ([three.js](https://threejs.org/)). This
is a proof-of-concept; the first mesh-producing tool wired in is
[OpenCASCADE.js](https://ocjs.org/) (the OCCT CAD kernel compiled to WebAssembly).

Everything runs client-side — no server, no uploads.

## What's interesting here

CAD B-rep faces are not triangles: each face carries an underlying **NURBS
(rational B-spline) surface** — a piecewise polynomial in two parameters. That
is exactly the "high-order mesh / polynomials on faces" idea. mesh-studio
extracts those polynomial patches (control points, weights, knots, degree)
*alongside* the triangulation, so you can:

- shade the tessellated surface, or view its **wireframe**;
- see each face's **control net** (the polynomial's control polygon) and its
  **isocurves** (constant-parameter curves sampled on the true surface);
- drag a **resolution** slider to re-tessellate the same NURBS faces from
  coarse-and-faceted to smooth;
- click a face to read its **degree, pole count, knot structure** and whether it
  is rational or purely polynomial.

## Sources (v1)

- **Built-in primitives** generated in-browser: sphere, torus, cylinder, cone,
  box, rounded box (free-form fillet faces), and the classic OCCT "bottle".
- **STEP / IGES import**: open a `.step`/`.stp` or `.iges`/`.igs` file — OCCT
  reads it natively. "Sample STEP" round-trips a box through OCCT's own writer +
  reader to demonstrate the import path with no bundled file.

## Export

- **OBJ / PLY / STL** — the current triangulation.
- **NURBS patches (JSON)** — the polynomial-native representation (degrees,
  poles, weights, knots per face).
- **STEP** — the B-rep (original bytes for an imported file; re-written from the
  kernel for primitives).

## Internal model

The internal representation is deliberately broader than a triangle mesh so more
tools can plug in later. A `SurfaceModel` is a list of **patches**, and a patch
is a discriminated union (`src/model/types.ts`). v1 emits `nurbs` patches (each
carrying both a triangulation and the B-spline surface); `linear`, `lagrange`
and `parametric` kinds are reserved growth points for future tools.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build  (bundles the ~30 MB OCCT wasm as an asset)
npm run lint
```

The OpenCASCADE runtime (~30 MB WASM) is loaded lazily on the first source
action, not at page load.

## Layout

```
src/
  occ/        OpenCASCADE integration (all OCCT calls confined here)
    loader.ts     lazy singleton initOpenCascade({ mainWasm })
    primitives.ts BRepPrimAPI shape builders + the tutorial bottle
    importCad.ts  STEP/IGES readers via Emscripten FS
    exportCad.ts  STEPControl_Writer
    extract.ts    shape -> SurfaceModel: BRepMesh triangulation + NURBS extraction
  model/      types.ts (SurfaceModel/Patch) + tessellate.ts (pure geometry helpers)
  render/     SurfaceView.tsx (plain three.js) + palette.ts
  export/     meshWriters.ts (OBJ/PLY/STL) + nurbsJson.ts
  sources.ts  registry of built-in primitives
  App.tsx     sidebar UI + viewport
```

Part of the [concept-collection](https://github.com/concept-collection) org.
