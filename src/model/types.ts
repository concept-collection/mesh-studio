/**
 * The internal mesh model for mesh-studio.
 *
 * Deliberately broader than a plain triangle mesh: a `SurfaceModel` is a
 * collection of *patches*, and a patch is a discriminated union so that
 * different mesh-producing tools can contribute different kinds of faces
 * without a redesign. v1 (OpenCASCADE) emits `nurbs` patches — each carrying
 * both a triangulation for display and the underlying rational-B-spline
 * surface (the "polynomial on the face"). The other kinds are reserved growth
 * points documented below.
 */

/** A triangulated approximation of one patch — what three.js consumes. */
export interface TriMesh {
  /** Flat xyz triples, 3 numbers per vertex. */
  positions: Float32Array
  /** Flat xyz triples, 3 numbers per vertex (matches positions). */
  normals: Float32Array
  /** Flat triangle indices (0-based), 3 per triangle. */
  indices: Uint32Array
}

/**
 * A rational tensor-product B-spline (NURBS) surface — a piecewise polynomial
 * in two parameters (u, v). This is the exact object an OpenCASCADE B-rep face
 * carries. Poles are stored row-major: pole (i, j) with 0 <= i < nu,
 * 0 <= j < nv lives at index `(i * nv + j) * 3` in `poles`.
 */
export interface NurbsSurface {
  uDegree: number
  vDegree: number
  nu: number
  nv: number
  /** Control points ("poles"), nu*nv*3 numbers, row-major. */
  poles: Float32Array
  /** Per-pole weights, nu*nv numbers, or null when non-rational (pure polynomial). */
  weights: Float32Array | null
  /** Distinct knot values in u, with matching multiplicities. */
  uKnots: number[]
  uMults: number[]
  vKnots: number[]
  vMults: number[]
}

/** One face of a model. Discriminated on `kind`. */
export type Patch =
  | NurbsPatch
  // --- reserved growth points (not emitted in v1) ---
  // A flat linear cell mesh imported from a triangle/quad/polygon format.
  | { kind: 'linear'; id: number; tri: TriMesh }
  // A nodal high-order element (e.g. surfacefun): order + a grid of sample nodes.
  | { kind: 'lagrange'; id: number; tri: TriMesh; order: number }
  // A generic parametric patch carrying its own evaluator.
  | { kind: 'parametric'; id: number; tri: TriMesh }

export interface NurbsPatch {
  kind: 'nurbs'
  id: number
  /** Triangulation for display (from OpenCASCADE's BRepMesh, respects trimming). */
  tri: TriMesh
  /** The underlying polynomial surface, or null if extraction was unavailable. */
  nurbs: NurbsSurface | null
  /** Sampled iso-parameter curves (world xyz polylines) for the isocurve view. */
  isoLines?: Float32Array[]
}

export interface SurfaceModel {
  patches: Patch[]
  source: {
    kind: 'primitive' | 'step' | 'iges'
    label: string
  }
  /** Original uploaded bytes, retained so STEP/IGES sources can be re-exported verbatim. */
  raw?: { format: 'step' | 'iges'; bytes: Uint8Array }
}

/** Every patch has a triangulation; this narrows the union for callers. */
export function patchTri(patch: Patch): TriMesh {
  return patch.tri
}

export function triangleCount(model: SurfaceModel): number {
  let n = 0
  for (const p of model.patches) n += p.tri.indices.length / 3
  return n
}

export function vertexCount(model: SurfaceModel): number {
  let n = 0
  for (const p of model.patches) n += p.tri.positions.length / 3
  return n
}

/** How many faces carry extracted NURBS data (for the "N/M faces" readout). */
export function nurbsCoverage(model: SurfaceModel): { withNurbs: number; total: number } {
  let withNurbs = 0
  for (const p of model.patches) {
    if (p.kind === 'nurbs' && p.nurbs) withNurbs++
  }
  return { withNurbs, total: model.patches.length }
}
