/**
 * The polynomial-native export: dump each face's NURBS surface (degrees, poles,
 * weights, knots) to JSON. This is the "mesh defined by polynomials on faces"
 * representation, distinct from any triangulated file.
 */
import type { SurfaceModel } from '../model/types'

export function toNurbsJson(model: SurfaceModel): Uint8Array {
  const patches = model.patches.map((p) => {
    if (p.kind === 'nurbs' && p.nurbs) {
      const n = p.nurbs
      return {
        id: p.id,
        kind: 'nurbs',
        uDegree: n.uDegree,
        vDegree: n.vDegree,
        nu: n.nu,
        nv: n.nv,
        rational: n.weights !== null,
        uKnots: n.uKnots,
        uMults: n.uMults,
        vKnots: n.vKnots,
        vMults: n.vMults,
        poles: Array.from(n.poles),
        weights: n.weights ? Array.from(n.weights) : null,
      }
    }
    return { id: p.id, kind: p.kind, nurbs: null }
  })
  const doc = {
    format: 'mesh-studio-nurbs',
    version: 1,
    source: model.source.label,
    patchCount: model.patches.length,
    polesLayout: 'row-major, pole(i,j) at (i*nv + j)*3',
    patches,
  }
  return new TextEncoder().encode(JSON.stringify(doc, null, 2))
}
