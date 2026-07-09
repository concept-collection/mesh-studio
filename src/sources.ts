/**
 * Registry of built-in primitive sources. Each entry knows how to build its
 * OCCT shape; the app hands the shape to `buildModel` (src/occ/extract.ts).
 */
import type { OpenCascade, Shape } from './occ/types'
import {
  makeBottle,
  makeBox,
  makeCone,
  makeCylinder,
  makeFilletBox,
  makeSphere,
  makeTorus,
} from './occ/primitives'

export interface PrimitiveSource {
  id: string
  label: string
  /** One-line note about the kind of faces this produces. */
  blurb: string
  build: (oc: OpenCascade) => Shape
}

export const primitives: PrimitiveSource[] = [
  {
    id: 'sphere',
    label: 'Sphere',
    blurb: 'One analytic spherical face — a single rational patch after NURBS conversion.',
    build: (oc) => makeSphere(oc),
  },
  {
    id: 'torus',
    label: 'Torus',
    blurb: 'A toroidal face, periodic in both parameters.',
    build: (oc) => makeTorus(oc),
  },
  {
    id: 'cylinder',
    label: 'Cylinder',
    blurb: 'Cylindrical side face capped by two planar disks.',
    build: (oc) => makeCylinder(oc),
  },
  {
    id: 'cone',
    label: 'Cone',
    blurb: 'A truncated cone — conical face plus caps.',
    build: (oc) => makeCone(oc),
  },
  {
    id: 'box',
    label: 'Box',
    blurb: 'Six planar faces — degree (1,1) NURBS patches.',
    build: (oc) => makeBox(oc),
  },
  {
    id: 'fillet-box',
    label: 'Rounded box',
    blurb: 'Box with rounded edges — introduces free-form NURBS fillet faces.',
    build: (oc) => makeFilletBox(oc),
  },
  {
    id: 'bottle',
    label: 'Bottle',
    blurb: 'The OpenCASCADE tutorial bottle: mixed planar, swept and fused faces.',
    build: (oc) => makeBottle(oc),
  },
]
