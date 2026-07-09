/**
 * shape -> SurfaceModel.
 *
 * Two things happen per B-rep face:
 *  - **Triangulation** (always): OpenCASCADE's BRepMesh produces a triangle
 *    approximation that respects the face's trimming. This is what three.js
 *    draws, and it never depends on NURBS extraction succeeding.
 *  - **NURBS extraction** (best-effort): after converting the shape's faces to
 *    B-spline form, we read each face's poles / weights / knots / degree — the
 *    actual polynomial that defines the surface — plus a few sampled isocurves.
 *
 * The mesh density is controlled by a dimensionless `quality` in [0, 1] fed to
 * BRepMesh in *relative* mode, so it is independent of the model's scale.
 */
import type { NurbsSurface, Patch, SurfaceModel, TriMesh } from '../model/types'
import type { OpenCascade, Shape } from './types'

export interface BuiltModel {
  model: SurfaceModel
  /** The (NURBS-converted, if possible) shape kept for re-tessellation. */
  meshShape: Shape
}

const EMPTY_TRI: TriMesh = {
  positions: new Float32Array(0),
  normals: new Float32Array(0),
  indices: new Uint32Array(0),
}

/** Map quality in [0,1] to BRepMesh relative-linear and angular deflections. */
function deflections(quality: number): { lin: number; ang: number } {
  const q = Math.min(1, Math.max(0, quality))
  return {
    lin: 0.02 - (0.02 - 0.0007) * q, // relative to edge size
    ang: 0.8 - (0.8 - 0.15) * q, // radians
  }
}

function runMesh(oc: OpenCascade, shape: Shape, quality: number): void {
  const { lin, ang } = deflections(quality)
  try {
    // second arg (forceFaceDeflection) is required in this OCCT build; Clean
    // wipes the old triangulation so a coarser deflection actually coarsens.
    oc.BRepTools.Clean(shape, false)
  } catch {
    /* Clean unavailable — IncrementalMesh still recomputes when deflection differs */
  }
  new oc.BRepMesh_IncrementalMesh_2(shape, lin, true, ang, false)
}

/** Per-vertex normals from the triangle connectivity (fallback if OCCT's fail). */
function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length)
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t] * 3
    const b = indices[t + 1] * 3
    const c = indices[t + 2] * 3
    const ux = positions[b] - positions[a]
    const uy = positions[b + 1] - positions[a + 1]
    const uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a]
    const vy = positions[c + 1] - positions[a + 1]
    const vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    for (const i of [a, b, c]) {
      normals[i] += nx
      normals[i + 1] += ny
      normals[i + 2] += nz
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    normals[i] /= len
    normals[i + 1] /= len
    normals[i + 2] /= len
  }
  return normals
}

/** Read the BRepMesh triangulation stored on a face (world coordinates). */
function readFaceTriangulation(oc: OpenCascade, face: Shape): TriMesh {
  const loc = new oc.TopLoc_Location_1()
  const handle = oc.BRep_Tool.Triangulation(face, loc, 0)
  if (handle.IsNull()) {
    loc.delete()
    return EMPTY_TRI
  }
  const tri = handle.get()
  const trsf = loc.Transformation()
  const nNodes = tri.NbNodes()

  const positions = new Float32Array(nNodes * 3)
  for (let i = 1; i <= nNodes; i++) {
    const node = tri.Node(i)
    const p = node.Transformed(trsf)
    positions[(i - 1) * 3] = p.X()
    positions[(i - 1) * 3 + 1] = p.Y()
    positions[(i - 1) * 3 + 2] = p.Z()
    node.delete()
    p.delete()
  }

  const forward = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_FORWARD
  const triangles = tri.Triangles()
  const nTri = tri.NbTriangles()
  const indices = new Uint32Array(nTri * 3)
  for (let nt = 1; nt <= nTri; nt++) {
    const t = triangles.Value(nt)
    let n1 = t.Value(1)
    let n2 = t.Value(2)
    const n3 = t.Value(3)
    if (!forward) {
      const tmp = n1
      n1 = n2
      n2 = tmp
    }
    indices[(nt - 1) * 3] = n1 - 1
    indices[(nt - 1) * 3 + 1] = n2 - 1
    indices[(nt - 1) * 3 + 2] = n3 - 1
    t.delete()
  }

  let normals: Float32Array = new Float32Array(nNodes * 3)
  let haveNormals = false
  try {
    const pc = new oc.Poly_Connect_2(handle)
    const nrm = new oc.TColgp_Array1OfDir_2(1, nNodes)
    oc.StdPrs_ToolTriangulatedShape.Normal(face, pc, nrm)
    for (let i = nrm.Lower(); i <= nrm.Upper(); i++) {
      const d0 = nrm.Value(i)
      const d = d0.Transformed(trsf)
      const s = forward ? 1 : -1
      normals[(i - 1) * 3] = s * d.X()
      normals[(i - 1) * 3 + 1] = s * d.Y()
      normals[(i - 1) * 3 + 2] = s * d.Z()
      d0.delete()
      d.delete()
    }
    nrm.delete()
    pc.delete()
    haveNormals = true
  } catch {
    /* fall back below */
  }
  if (!haveNormals) normals = computeNormals(positions, indices)

  triangles.delete()
  trsf.delete()
  handle.delete()
  loc.delete()
  return { positions, normals, indices }
}

/** Try to convert every face of the shape to B-spline form. */
function nurbsConvert(oc: OpenCascade, shape: Shape): { shape: Shape; ok: boolean } {
  try {
    const conv = new oc.BRepBuilderAPI_NurbsConvert_2(shape, true)
    return { shape: conv.Shape(), ok: true }
  } catch {
    return { shape, ok: false }
  }
}

/** Extract a face's B-spline surface data plus sampled isocurves, or null. */
function extractNurbs(oc: OpenCascade, face: Shape): { nurbs: NurbsSurface; isoLines: Float32Array[] } | null {
  let handle: Shape | null = null
  let bsHandle: Shape | null = null
  try {
    handle = oc.BRep_Tool.Surface_2(face)
    const raw = handle.get()
    if (raw.$$?.ptrType?.name !== 'Geom_BSplineSurface*') return null

    bsHandle = new oc.Handle_Geom_BSplineSurface_2(raw)
    const bs = bsHandle.get()

    const uDegree: number = bs.UDegree()
    const vDegree: number = bs.VDegree()
    const nu: number = bs.NbUPoles()
    const nv: number = bs.NbVPoles()
    const rational = bs.IsURational() || bs.IsVRational()

    const poles = new Float32Array(nu * nv * 3)
    const weights = rational ? new Float32Array(nu * nv) : null
    for (let i = 1; i <= nu; i++) {
      for (let j = 1; j <= nv; j++) {
        const p = bs.Pole(i, j)
        const idx = ((i - 1) * nv + (j - 1)) * 3
        poles[idx] = p.X()
        poles[idx + 1] = p.Y()
        poles[idx + 2] = p.Z()
        p.delete()
        if (weights) weights[(i - 1) * nv + (j - 1)] = bs.Weight(i, j)
      }
    }

    const uKnots: number[] = []
    const uMults: number[] = []
    for (let i = 1; i <= bs.NbUKnots(); i++) {
      uKnots.push(bs.UKnot(i))
      uMults.push(bs.UMultiplicity(i))
    }
    const vKnots: number[] = []
    const vMults: number[] = []
    for (let i = 1; i <= bs.NbVKnots(); i++) {
      vKnots.push(bs.VKnot(i))
      vMults.push(bs.VMultiplicity(i))
    }

    const isoLines = sampleIsoLines(bs, uKnots, vKnots)
    const nurbs: NurbsSurface = { uDegree, vDegree, nu, nv, poles, weights, uKnots, uMults, vKnots, vMults }
    return { nurbs, isoLines }
  } catch {
    return null
  } finally {
    bsHandle?.delete()
    handle?.delete()
  }
}

/** Sample constant-u and constant-v curves on the surface for the isocurve view. */
function sampleIsoLines(bs: Shape, uKnots: number[], vKnots: number[]): Float32Array[] {
  const NLINES = 5
  const NS = 40
  const uMin = uKnots[0]
  const uMax = uKnots[uKnots.length - 1]
  const vMin = vKnots[0]
  const vMax = vKnots[vKnots.length - 1]
  const lines: Float32Array[] = []
  const evalTo = (line: Float32Array, s: number, u: number, v: number) => {
    const p = bs.Value(u, v)
    line[s * 3] = p.X()
    line[s * 3 + 1] = p.Y()
    line[s * 3 + 2] = p.Z()
    p.delete()
  }
  for (let a = 0; a < NLINES; a++) {
    const u = uMin + ((uMax - uMin) * a) / (NLINES - 1)
    const line = new Float32Array(NS * 3)
    for (let s = 0; s < NS; s++) evalTo(line, s, u, vMin + ((vMax - vMin) * s) / (NS - 1))
    lines.push(line)
  }
  for (let a = 0; a < NLINES; a++) {
    const v = vMin + ((vMax - vMin) * a) / (NLINES - 1)
    const line = new Float32Array(NS * 3)
    for (let s = 0; s < NS; s++) evalTo(line, s, uMin + ((uMax - uMin) * s) / (NS - 1), v)
    lines.push(line)
  }
  return lines
}

/** Iterate the faces of a shape, calling `fn` with each `TopoDS_Face`. */
function forEachFace(oc: OpenCascade, shape: Shape, fn: (face: Shape, index: number) => void): void {
  const exp = new oc.TopExp_Explorer_1()
  let index = 0
  for (
    exp.Init(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    exp.More();
    exp.Next()
  ) {
    const face = oc.TopoDS.Face_1(exp.Current())
    fn(face, index++)
    face.delete()
  }
  exp.delete()
}

/** Build a full SurfaceModel from a freshly created / imported shape. */
export function buildModel(
  oc: OpenCascade,
  rawShape: Shape,
  quality: number,
  source: SurfaceModel['source'],
  raw?: SurfaceModel['raw'],
): BuiltModel {
  const { shape: meshShape, ok } = nurbsConvert(oc, rawShape)
  runMesh(oc, meshShape, quality)

  const patches: Patch[] = []
  forEachFace(oc, meshShape, (face, index) => {
    const tri = readFaceTriangulation(oc, face)
    const extracted = ok ? extractNurbs(oc, face) : null
    patches.push({
      kind: 'nurbs',
      id: index,
      tri,
      nurbs: extracted?.nurbs ?? null,
      isoLines: extracted?.isoLines,
    })
  })

  return { model: { patches, source, raw }, meshShape }
}

/** Re-tessellate an existing model at a new quality, reusing its NURBS data. */
export function retessellate(
  oc: OpenCascade,
  meshShape: Shape,
  quality: number,
  patches: Patch[],
): Patch[] {
  runMesh(oc, meshShape, quality)
  const tris: TriMesh[] = []
  forEachFace(oc, meshShape, (face) => {
    tris.push(readFaceTriangulation(oc, face))
  })
  return patches.map((p, i) => ({ ...p, tri: tris[i] ?? p.tri }))
}
