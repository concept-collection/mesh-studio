/**
 * Plain-three.js interactive view of a SurfaceModel (adapted from
 * mesh-pde-solver's SurfaceView): WebGLRenderer + OrbitControls + ResizeObserver
 * with an imperative scene rebuilt whenever the model, view mode or selection
 * changes. One three.js mesh per patch, so faces can be picked by raycasting.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Patch, SurfaceModel } from '../model/types'
import { controlNet, modelBounds } from '../model/tessellate'
import { faceColor, ISO_COLOR, NET_COLOR, POLE_COLOR, SELECTED_COLOR } from './palette'

export type ViewMode = 'shaded' | 'wire' | 'net' | 'iso'

interface SceneState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  content: THREE.Group
  raycaster: THREE.Raycaster
  animId: number
}

function triGeometry(patch: Patch): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(patch.tri.positions, 3))
  if (patch.tri.normals.length === patch.tri.positions.length) {
    g.setAttribute('normal', new THREE.BufferAttribute(patch.tri.normals, 3))
  } else {
    g.computeVertexNormals()
  }
  g.setIndex(new THREE.BufferAttribute(patch.tri.indices, 1))
  return g
}

function buildContent(
  content: THREE.Group,
  model: SurfaceModel,
  mode: ViewMode,
  selectedFaceId: number | null,
) {
  // dispose previous
  content.traverse((obj) => {
    const withGeom = obj as THREE.Mesh
    withGeom.geometry?.dispose()
    const mat = (obj as THREE.Mesh).material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat?.dispose()
  })
  content.clear()

  const { center, radius } = modelBounds(model)
  content.scale.setScalar(1 / radius)
  content.position.set(-center[0] / radius, -center[1] / radius, -center[2] / radius)

  const facesFaint = mode === 'net' || mode === 'iso'

  for (const patch of model.patches) {
    const selected = patch.id === selectedFaceId
    const color = selected ? SELECTED_COLOR : faceColor(patch.id)
    const geom = triGeometry(patch)

    let material: THREE.Material
    if (mode === 'wire') {
      material = new THREE.MeshBasicMaterial({ color, wireframe: true })
    } else if (facesFaint) {
      material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: selected ? 0.35 : 0.12,
      })
    } else {
      material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.55,
        metalness: 0.08,
        side: THREE.DoubleSide,
        emissive: selected ? SELECTED_COLOR : new THREE.Color(0, 0, 0),
        emissiveIntensity: selected ? 0.35 : 0,
      })
    }
    const mesh = new THREE.Mesh(geom, material)
    mesh.userData.faceId = patch.id
    content.add(mesh)

    if (mode === 'net' && patch.kind === 'nurbs' && patch.nurbs) {
      const { segments, points } = controlNet(patch.nurbs)
      const segGeom = new THREE.BufferGeometry()
      segGeom.setAttribute('position', new THREE.BufferAttribute(segments, 3))
      content.add(
        new THREE.LineSegments(
          segGeom,
          new THREE.LineBasicMaterial({ color: selected ? SELECTED_COLOR : NET_COLOR }),
        ),
      )
      const ptGeom = new THREE.BufferGeometry()
      ptGeom.setAttribute('position', new THREE.BufferAttribute(points, 3))
      content.add(
        new THREE.Points(
          ptGeom,
          new THREE.PointsMaterial({ color: POLE_COLOR, size: 0.03 * radius, sizeAttenuation: true }),
        ),
      )
    }

    if (mode === 'iso' && patch.kind === 'nurbs' && patch.isoLines) {
      for (const line of patch.isoLines) {
        const lineGeom = new THREE.BufferGeometry()
        lineGeom.setAttribute('position', new THREE.BufferAttribute(line, 3))
        content.add(
          new THREE.Line(
            lineGeom,
            new THREE.LineBasicMaterial({ color: selected ? SELECTED_COLOR : ISO_COLOR }),
          ),
        )
      }
    }
  }
}

export function SurfaceView({
  model,
  mode,
  selectedFaceId,
  onSelectFace,
}: {
  model: SurfaceModel | null
  mode: ViewMode
  selectedFaceId: number | null
  onSelectFace: (id: number | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<SceneState | null>(null)
  const onSelectRef = useRef(onSelectFace)
  onSelectRef.current = onSelectFace

  // set up the scene once
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(0x161a22)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
    camera.position.set(2.4, 1.8, 2.6)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(4, 6, 5)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.4)
    fill.position.set(-5, -3, -4)
    scene.add(fill)

    const content = new THREE.Group()
    scene.add(content)

    const raycaster = new THREE.Raycaster()

    const animId = requestAnimationFrame(function loop() {
      controls.update()
      renderer.render(scene, camera)
      if (stateRef.current) stateRef.current.animId = requestAnimationFrame(loop)
    })
    stateRef.current = { renderer, scene, camera, controls, content, raycaster, animId }

    const onPointerDown = (ev: PointerEvent) => {
      const st = stateRef.current
      if (!st) return
      const rect = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      )
      st.raycaster.setFromCamera(ndc, st.camera)
      const meshes = st.content.children.filter((c) => (c as THREE.Mesh).isMesh)
      const hits = st.raycaster.intersectObjects(meshes, false)
      const id = hits.length ? (hits[0].object.userData.faceId as number) : null
      onSelectRef.current(id ?? null)
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)

    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      renderer.setSize(rect.width, rect.height)
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      cancelAnimationFrame(stateRef.current?.animId ?? animId)
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      stateRef.current = null
    }
  }, [])

  // rebuild content when inputs change
  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    if (model) buildContent(st.content, model, mode, selectedFaceId)
    else {
      st.content.clear()
    }
  }, [model, mode, selectedFaceId])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {!model && <div className="view-placeholder">Pick a primitive or open a STEP/IGES file</div>}
    </div>
  )
}
