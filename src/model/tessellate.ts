/**
 * Pure geometry helpers that turn a SurfaceModel into renderable / exportable
 * arrays. No three.js and no OpenCASCADE here — both the renderer and the
 * export writers depend on this module.
 */
import type { NurbsSurface, SurfaceModel, TriMesh } from './types'

/** Axis-aligned bounds of the model, plus a center and radius for framing. */
export interface Bounds {
  min: [number, number, number]
  max: [number, number, number]
  center: [number, number, number]
  radius: number
}

function extend(min: number[], max: number[], x: number, y: number, z: number) {
  if (x < min[0]) min[0] = x
  if (y < min[1]) min[1] = y
  if (z < min[2]) min[2] = z
  if (x > max[0]) max[0] = x
  if (y > max[1]) max[1] = y
  if (z > max[2]) max[2] = z
}

export function modelBounds(model: SurfaceModel): Bounds {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const p of model.patches) {
    const pos = p.tri.positions
    for (let i = 0; i + 2 < pos.length; i += 3) extend(min, max, pos[i], pos[i + 1], pos[i + 2])
    // include control poles so the control-net view stays in frame
    if (p.kind === 'nurbs' && p.nurbs) {
      const poles = p.nurbs.poles
      for (let i = 0; i + 2 < poles.length; i += 3) extend(min, max, poles[i], poles[i + 1], poles[i + 2])
    }
  }
  if (!isFinite(min[0])) {
    min[0] = min[1] = min[2] = -1
    max[0] = max[1] = max[2] = 1
  }
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ]
  const radius =
    0.5 * Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1e-6)
  return { min: min as [number, number, number], max: max as [number, number, number], center, radius }
}

/**
 * Line segments of a NURBS control net: the pole grid connected along u and v.
 * Returns flat xyz pairs (each 6 numbers = one segment) plus the poles as points.
 */
export function controlNet(nurbs: NurbsSurface): { segments: Float32Array; points: Float32Array } {
  const { nu, nv, poles } = nurbs
  const pole = (i: number, j: number, c: number) => poles[(i * nv + j) * 3 + c]
  const segs: number[] = []
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      if (i + 1 < nu) {
        segs.push(pole(i, j, 0), pole(i, j, 1), pole(i, j, 2))
        segs.push(pole(i + 1, j, 0), pole(i + 1, j, 1), pole(i + 1, j, 2))
      }
      if (j + 1 < nv) {
        segs.push(pole(i, j, 0), pole(i, j, 1), pole(i, j, 2))
        segs.push(pole(i, j + 1, 0), pole(i, j + 1, 1), pole(i, j + 1, 2))
      }
    }
  }
  return { segments: new Float32Array(segs), points: poles.slice() }
}

/** Merge every patch triangulation into one indexed mesh (for file export). */
export function mergeTriMeshes(model: SurfaceModel): TriMesh {
  let nVerts = 0
  let nIndices = 0
  for (const p of model.patches) {
    nVerts += p.tri.positions.length / 3
    nIndices += p.tri.indices.length
  }
  const positions = new Float32Array(nVerts * 3)
  const normals = new Float32Array(nVerts * 3)
  const indices = new Uint32Array(nIndices)
  let vOff = 0
  let iOff = 0
  for (const p of model.patches) {
    const t = p.tri
    positions.set(t.positions, vOff * 3)
    normals.set(t.normals, vOff * 3)
    for (let k = 0; k < t.indices.length; k++) indices[iOff + k] = t.indices[k] + vOff
    vOff += t.positions.length / 3
    iOff += t.indices.length
  }
  return { positions, normals, indices }
}
