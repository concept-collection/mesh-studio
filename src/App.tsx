import { useEffect, useRef, useState } from 'react'
import { SurfaceView } from './render/SurfaceView'
import type { ViewMode } from './render/SurfaceView'
import type { NurbsPatch, SurfaceModel } from './model/types'
import { nurbsCoverage, triangleCount, vertexCount } from './model/types'
import { mergeTriMeshes } from './model/tessellate'
import { loadOpenCascade } from './occ/loader'
import type { OpenCascade, Shape } from './occ/types'
import { buildModel, retessellate } from './occ/extract'
import { importCadFile } from './occ/importCad'
import { shapeToStep } from './occ/exportCad'
import { primitives } from './sources'
import { ABC_DATASET_URL, fetchRandomAbcStep } from './abcDataset'
import { toOBJ, toPLY, toSTL } from './export/meshWriters'
import { toNurbsJson } from './export/nurbsJson'
import './index.css'

type EngineState = 'idle' | 'loading' | 'ready' | 'error'

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: 'shaded', label: 'Shaded' },
  { id: 'wire', label: 'Wireframe' },
  { id: 'net', label: 'Control net' },
  { id: 'iso', label: 'Isocurves' },
]

const EXPORT_FORMATS = [
  { id: 'obj', label: 'OBJ (triangles)', ext: '.obj' },
  { id: 'ply', label: 'PLY (triangles)', ext: '.ply' },
  { id: 'stl', label: 'STL (triangles)', ext: '.stl' },
  { id: 'nurbs', label: 'NURBS patches (JSON)', ext: '.nurbs.json' },
  { id: 'step', label: 'STEP (B-rep)', ext: '.step' },
] as const

type ExportId = (typeof EXPORT_FORMATS)[number]['id']

function download(bytes: Uint8Array, filename: string) {
  // copy into a fresh ArrayBuffer-backed view so it is a valid BlobPart
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [engine, setEngine] = useState<{ state: EngineState; message: string }>({
    state: 'idle',
    message: 'CAD engine loads on first use (~30 MB).',
  })
  const [model, setModel] = useState<SurfaceModel | null>(null)
  const [baseName, setBaseName] = useState('model')
  const [quality, setQuality] = useState(0.5)
  const [mode, setMode] = useState<ViewMode>('shaded')
  const [selectedFaceId, setSelectedFaceId] = useState<number | null>(null)
  const [exportId, setExportId] = useState<ExportId>('obj')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ocRef = useRef<OpenCascade | null>(null)
  const meshShapeRef = useRef<Shape | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function ensureOc(): Promise<OpenCascade> {
    if (ocRef.current) return ocRef.current
    const oc = await loadOpenCascade((message) => setEngine({ state: 'loading', message }))
    ocRef.current = oc
    setEngine({ state: 'ready', message: 'CAD engine ready' })
    return oc
  }

  async function load(
    build: (oc: OpenCascade) => Shape,
    source: SurfaceModel['source'],
    name: string,
    raw?: SurfaceModel['raw'],
  ) {
    setError(null)
    setBusy('building')
    setSelectedFaceId(null)
    try {
      const oc = await ensureOc()
      const shape = build(oc)
      const { model: built, meshShape } = buildModel(oc, shape, quality, source, raw)
      meshShapeRef.current = meshShape
      setModel(built)
      setBaseName(name)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEngine((s) => (s.state === 'loading' ? { state: 'error', message: 'CAD engine failed to load.' } : s))
    } finally {
      setBusy(null)
    }
  }

  const loadPrimitive = (id: string) => {
    const src = primitives.find((p) => p.id === id)
    if (!src) return
    void load(src.build, { kind: 'primitive', label: src.label }, src.id)
  }

  const loadRandomAbc = async () => {
    setError(null)
    setBusy('downloading')
    try {
      const { name, bytes } = await fetchRandomAbcStep()
      await load(
        (oc) => importCadFile(oc, name, bytes).shape,
        { kind: 'step', label: `${name} (ABC dataset)` },
        name.replace(/\.[^.]+$/, ''),
        { format: 'step', bytes },
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(null)
    }
  }

  const openFile = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const lower = file.name.toLowerCase()
    const format: 'step' | 'iges' = lower.endsWith('.iges') || lower.endsWith('.igs') ? 'iges' : 'step'
    void load(
      (oc) => importCadFile(oc, file.name, bytes).shape,
      { kind: format, label: file.name },
      file.name.replace(/\.[^.]+$/, ''),
      { format, bytes },
    )
  }

  // Re-tessellate (debounced) when the resolution slider settles.
  useEffect(() => {
    const oc = ocRef.current
    const meshShape = meshShapeRef.current
    if (!oc || !meshShape || !model) return
    const t = setTimeout(() => {
      setBusy('meshing')
      try {
        const patches = retessellate(oc, meshShape, quality, model.patches)
        setModel((m) => (m ? { ...m, patches } : m))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(null)
      }
    }, 150)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality])

  const doExport = () => {
    if (!model) return
    setError(null)
    try {
      const fmt = EXPORT_FORMATS.find((f) => f.id === exportId)!
      let bytes: Uint8Array
      if (exportId === 'nurbs') {
        bytes = toNurbsJson(model)
      } else if (exportId === 'step') {
        if (model.raw) {
          bytes = model.raw.bytes
        } else if (ocRef.current && meshShapeRef.current) {
          bytes = shapeToStep(ocRef.current, meshShapeRef.current)
        } else {
          throw new Error('STEP export unavailable for this model.')
        }
      } else {
        const merged = mergeTriMeshes(model)
        bytes = exportId === 'obj' ? toOBJ(merged) : exportId === 'ply' ? toPLY(merged) : toSTL(merged)
      }
      const base = baseName.replace(/[^\w-]+/g, '_').toLowerCase() || 'model'
      download(bytes, base + fmt.ext)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const selectedPatch =
    selectedFaceId != null
      ? (model?.patches.find((p) => p.id === selectedFaceId) as NurbsPatch | undefined)
      : undefined
  const coverage = model ? nurbsCoverage(model) : null

  return (
    <div className="app">
      <div className="sidebar">
        <h1>Mesh Studio</h1>
        <p className="tagline">
          Generate surface meshes with different tools and inspect them in 3D. First tool:{' '}
          <a href="https://ocjs.org/">OpenCASCADE.js</a> — CAD B-rep faces are true NURBS surfaces
          (polynomials on faces), extracted here alongside the triangulation.
        </p>
        <div className={`engine-status ${engine.state}`}>{engine.message}</div>

        <section>
          <h2>Sources</h2>
          <button
            className="primary"
            onClick={() => void loadRandomAbc()}
            disabled={busy !== null}
            title="Download a random CAD model from the first 1000 STEP files of the ABC dataset"
          >
            🎲 Random CAD model
          </button>
          <p className="footnote">
            Random models are drawn from{' '}
            <a href="https://concept-collection.github.io/abc-step-1000/">abc-step-1000</a>, a
            rehosted slice of the <a href={ABC_DATASET_URL}>ABC dataset</a> of CAD models (Koch et
            al., CVPR 2019).
          </p>
          <div className="primitive-grid">
            {primitives.map((p) => (
              <button
                key={p.id}
                onClick={() => loadPrimitive(p.id)}
                disabled={busy !== null}
                title={p.blurb}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="button-row">
            <button onClick={() => fileInputRef.current?.click()} disabled={busy !== null}>
              Open STEP/IGES…
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".step,.stp,.iges,.igs"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void openFile(file)
              e.target.value = ''
            }}
          />
          {busy && (
            <div className="busy">
              {busy === 'building' ? 'Building model…' : busy === 'downloading' ? 'Downloading model…' : 'Re-meshing…'}
            </div>
          )}
          {error && <div className="error">{error}</div>}
        </section>

        {model && (
          <section>
            <h2>Model</h2>
            <div className="mesh-info">
              <div className="source">{model.source.label}</div>
              <div>
                {model.patches.length} faces · {triangleCount(model).toLocaleString()} triangles ·{' '}
                {vertexCount(model).toLocaleString()} vertices
              </div>
              {coverage && (
                <div className={`chip ${coverage.withNurbs === coverage.total ? 'on' : ''}`}>
                  NURBS extracted on {coverage.withNurbs}/{coverage.total} faces
                </div>
              )}
            </div>
          </section>
        )}

        {model && (
          <section>
            <h2>View</h2>
            <div className="view-toolbar">
              {VIEW_MODES.map((m) => (
                <button
                  key={m.id}
                  className={mode === m.id ? 'active' : ''}
                  onClick={() => setMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <label className="slider">
              <span>Mesh resolution</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                disabled={busy !== null}
              />
            </label>
            <p className="footnote">
              Coarse ↔ fine re-tessellates the same NURBS faces — drag to see the polynomial
              surface go from faceted to smooth. Click a face to inspect it.
            </p>
          </section>
        )}

        {selectedPatch && (
          <section>
            <h2>Face #{selectedPatch.id}</h2>
            {selectedPatch.nurbs ? (
              <div className="mesh-info">
                <div>
                  Degree (u, v): <strong>{selectedPatch.nurbs.uDegree}, {selectedPatch.nurbs.vDegree}</strong>
                </div>
                <div>
                  Control net: {selectedPatch.nurbs.nu} × {selectedPatch.nurbs.nv} poles
                </div>
                <div>{selectedPatch.nurbs.weights ? 'Rational (NURBS)' : 'Polynomial (non-rational)'}</div>
                <div>
                  Knots: {selectedPatch.nurbs.uKnots.length} u, {selectedPatch.nurbs.vKnots.length} v
                </div>
                <div className="footnote">
                  {selectedPatch.tri.indices.length / 3} triangles at this resolution
                </div>
              </div>
            ) : (
              <div className="mesh-info">No NURBS data extracted for this face.</div>
            )}
            <button className="subtle" onClick={() => setSelectedFaceId(null)}>
              Clear selection
            </button>
          </section>
        )}

        {model && (
          <section>
            <h2>Export</h2>
            <select value={exportId} onChange={(e) => setExportId(e.target.value as ExportId)}>
              {EXPORT_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <button className="primary" onClick={doExport} disabled={busy !== null}>
              Download {EXPORT_FORMATS.find((f) => f.id === exportId)!.ext}
            </button>
            <p className="footnote">
              Triangle formats export the current tessellation. NURBS JSON stores the exact
              polynomial patches. STEP hands back the B-rep (original bytes for imported files).
            </p>
          </section>
        )}
      </div>

      <div className="viewport">
        <SurfaceView
          model={model}
          mode={mode}
          selectedFaceId={selectedFaceId}
          onSelectFace={setSelectedFaceId}
        />
      </div>
    </div>
  )
}

export default App
