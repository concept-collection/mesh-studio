/**
 * Random STEP models from abc-step-1000 — the first 1000 STEP files of the
 * ABC CAD dataset (Koch et al., CVPR 2019), rehosted gzip-compressed at
 * https://concept-collection.github.io/abc-step-1000/. No OCCT here: this
 * module only fetches bytes; the app feeds them to the normal import path.
 */

export const ABC_BASE = 'https://concept-collection.github.io/abc-step-1000'
export const ABC_DATASET_URL = 'https://deep-geometry.github.io/abc-dataset/'

// Files above this size make OCCT churn for a long time (the collection's
// largest is 204 MB); random picks stay snappy by drawing from the rest.
const MAX_STEP_BYTES = 2_000_000

interface AbcIndexFile {
  id: string
  name: string
  path: string
  stepBytes: number
  gzBytes: number
}

let indexPromise: Promise<AbcIndexFile[]> | null = null

function fetchIndex(): Promise<AbcIndexFile[]> {
  indexPromise ??= fetch(`${ABC_BASE}/index.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`abc-step-1000 index: HTTP ${res.status}`)
      return res.json()
    })
    .then((index: { files: AbcIndexFile[] }) => index.files)
    .catch((e) => {
      indexPromise = null // allow retry after a transient failure
      throw e
    })
  return indexPromise
}

async function gunzipIfNeeded(buf: ArrayBuffer): Promise<Uint8Array> {
  const head = new Uint8Array(buf, 0, 2)
  if (head[0] !== 0x1f || head[1] !== 0x8b) return new Uint8Array(buf)
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function fetchRandomAbcStep(): Promise<{ name: string; bytes: Uint8Array }> {
  const files = (await fetchIndex()).filter((f) => f.stepBytes <= MAX_STEP_BYTES)
  const file = files[Math.floor(Math.random() * files.length)]
  const res = await fetch(`${ABC_BASE}/${file.path}`)
  if (!res.ok) throw new Error(`${file.name}: HTTP ${res.status}`)
  return { name: file.name, bytes: await gunzipIfNeeded(await res.arrayBuffer()) }
}
