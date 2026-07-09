/**
 * Dependency-free writers from a merged `TriMesh` to common mesh files.
 * Positions and normals only — the tessellated approximation of the model.
 */
import type { TriMesh } from '../model/types'

export function toOBJ(mesh: TriMesh): Uint8Array {
  const { positions, normals, indices } = mesh
  const lines: string[] = ['# mesh-studio export']
  for (let i = 0; i < positions.length; i += 3) {
    lines.push(`v ${positions[i]} ${positions[i + 1]} ${positions[i + 2]}`)
  }
  for (let i = 0; i < normals.length; i += 3) {
    lines.push(`vn ${normals[i]} ${normals[i + 1]} ${normals[i + 2]}`)
  }
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] + 1
    const b = indices[i + 1] + 1
    const c = indices[i + 2] + 1
    lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`)
  }
  return new TextEncoder().encode(lines.join('\n') + '\n')
}

export function toPLY(mesh: TriMesh): Uint8Array {
  const { positions, normals, indices } = mesh
  const nVerts = positions.length / 3
  const nFaces = indices.length / 3
  const lines: string[] = [
    'ply',
    'format ascii 1.0',
    'comment mesh-studio export',
    `element vertex ${nVerts}`,
    'property float x',
    'property float y',
    'property float z',
    'property float nx',
    'property float ny',
    'property float nz',
    `element face ${nFaces}`,
    'property list uchar int vertex_index',
    'end_header',
  ]
  for (let i = 0; i < nVerts; i++) {
    const p = i * 3
    lines.push(
      `${positions[p]} ${positions[p + 1]} ${positions[p + 2]} ` +
        `${normals[p]} ${normals[p + 1]} ${normals[p + 2]}`,
    )
  }
  for (let i = 0; i < nFaces; i++) {
    const f = i * 3
    lines.push(`3 ${indices[f]} ${indices[f + 1]} ${indices[f + 2]}`)
  }
  return new TextEncoder().encode(lines.join('\n') + '\n')
}

export function toSTL(mesh: TriMesh): Uint8Array {
  const { positions, normals, indices } = mesh
  const nTri = indices.length / 3
  const buffer = new ArrayBuffer(84 + nTri * 50)
  const view = new DataView(buffer)
  // 80-byte header left as zeros, then triangle count
  view.setUint32(80, nTri, true)
  let off = 84
  const faceNormal = (a: number, b: number, c: number) => {
    // average the vertex normals, fall back to geometric normal
    let nx = normals[a] + normals[b] + normals[c]
    let ny = normals[a + 1] + normals[b + 1] + normals[c + 1]
    let nz = normals[a + 2] + normals[b + 2] + normals[c + 2]
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-9) {
      const ux = positions[b] - positions[a]
      const uy = positions[b + 1] - positions[a + 1]
      const uz = positions[b + 2] - positions[a + 2]
      const vx = positions[c] - positions[a]
      const vy = positions[c + 1] - positions[a + 1]
      const vz = positions[c + 2] - positions[a + 2]
      nx = uy * vz - uz * vy
      ny = uz * vx - ux * vz
      nz = ux * vy - uy * vx
    }
    const l = Math.hypot(nx, ny, nz) || 1
    return [nx / l, ny / l, nz / l] as const
  }
  for (let t = 0; t < nTri; t++) {
    const ia = indices[t * 3] * 3
    const ib = indices[t * 3 + 1] * 3
    const ic = indices[t * 3 + 2] * 3
    const [nx, ny, nz] = faceNormal(ia, ib, ic)
    view.setFloat32(off, nx, true)
    view.setFloat32(off + 4, ny, true)
    view.setFloat32(off + 8, nz, true)
    off += 12
    for (const iv of [ia, ib, ic]) {
      view.setFloat32(off, positions[iv], true)
      view.setFloat32(off + 4, positions[iv + 1], true)
      view.setFloat32(off + 8, positions[iv + 2], true)
      off += 12
    }
    view.setUint16(off, 0, true)
    off += 2
  }
  return new Uint8Array(buffer)
}
