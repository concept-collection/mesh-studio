/**
 * Write an OCCT shape out as a STEP file (used for primitive sources, which
 * have no original file to hand back).
 */
import type { OpenCascade, Shape } from './types'

export function shapeToStep(oc: OpenCascade, shape: Shape): Uint8Array {
  const writer = new oc.STEPControl_Writer_1()
  writer.Transfer(
    shape,
    oc.STEPControl_StepModelType.STEPControl_AsIs,
    true,
    new oc.Message_ProgressRange_1(),
  )
  const fname = 'export.step'
  writer.Write(fname)
  const bytes: Uint8Array = oc.FS.readFile(`/${fname}`)
  try {
    oc.FS.unlink(`/${fname}`)
  } catch {
    /* ignore */
  }
  // Copy out of the WASM heap view into a standalone buffer.
  return new Uint8Array(bytes)
}
