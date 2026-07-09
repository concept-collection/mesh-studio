/**
 * Import a STEP or IGES file into an OCCT shape, using Emscripten's virtual
 * filesystem (adapted from opencascade.js-examples' `loadSTEPorIGES`).
 */
import type { OpenCascade, Shape } from './types'

export interface ImportResult {
  shape: Shape
  format: 'step' | 'iges'
}

function formatFor(name: string): 'step' | 'iges' {
  const ext = name.toLowerCase().split('.').pop()
  if (ext === 'step' || ext === 'stp') return 'step'
  if (ext === 'iges' || ext === 'igs') return 'iges'
  throw new Error(`Unsupported file ".${ext}". Use .step/.stp or .iges/.igs.`)
}

export function importCadFile(oc: OpenCascade, name: string, bytes: Uint8Array): ImportResult {
  const format = formatFor(name)
  const fname = `import.${format}`
  try {
    oc.FS.unlink(`/${fname}`)
  } catch {
    /* no stale file */
  }
  oc.FS.createDataFile('/', fname, bytes, true, true, true)

  const reader = format === 'step' ? new oc.STEPControl_Reader_1() : new oc.IGESControl_Reader_1()
  const status = reader.ReadFile(fname)
  if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    try {
      oc.FS.unlink(`/${fname}`)
    } catch {
      /* ignore */
    }
    throw new Error(`OpenCASCADE could not read this ${format.toUpperCase()} file.`)
  }
  reader.TransferRoots(new oc.Message_ProgressRange_1())
  const shape = reader.OneShape()
  try {
    oc.FS.unlink(`/${fname}`)
  } catch {
    /* ignore */
  }
  if (shape.IsNull()) throw new Error('The file contained no usable geometry.')
  return { shape, format }
}
