import * as THREE from 'three'

/**
 * A distinct color per face id, spread around the hue circle by the golden
 * ratio so neighbouring faces stay easy to tell apart at any face count.
 */
export function faceColor(id: number): THREE.Color {
  const h = (id * 0.618033988749895) % 1
  return new THREE.Color().setHSL(h, 0.55, 0.62)
}

export const SELECTED_COLOR = new THREE.Color('#ffb020')
export const NET_COLOR = new THREE.Color('#9b6bff')
export const POLE_COLOR = new THREE.Color('#ffd166')
export const ISO_COLOR = new THREE.Color('#3fc7ff')
