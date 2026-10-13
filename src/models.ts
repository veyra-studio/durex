/**
 * Review page for the models: the foil packet and the condom side by side
 * in the studio, to turn, zoom, unroll and blow up. Not part of the film.
 */
import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createStage, Phase, supportsWebGL2 } from '@veyra/core'
import { threeLayer } from '@veyra/core/three'
import { createCondom } from './gl/condom'
import { createPacket, PACKET_FONTS, type Tier } from './gl/foil'
import { durexStudio } from './gl/light'

// The page scrolls nothing: the wheel zooms.
const stage = createStage({ scroll: false, quality: { dprRange: [1, 2] } })
const params = new URLSearchParams(location.search)
const pinned = params.get('quality') as Tier | null

if (!supportsWebGL2()) {
  document.querySelector('.review-note')!.textContent = 'This browser doesn’t offer WebGL2, so the models can’t be shown.'
} else {
  await Promise.all(PACKET_FONTS.map((font) => document.fonts.load(font, 'durex INVISIBLE')))
  const layer = stage.use(threeLayer({ autoRender: false, stableHeight: true }))
  // Read once the layer exists: on a software renderer (no GPU) it has just lowered the stage's quality.
  const tier: Tier = pinned ?? stage.quality?.tier.value ?? 'high'
  layer.canvas.style.pointerEvents = 'auto'
  const { renderer, scene } = layer
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.NeutralToneMapping
  scene.environment = durexStudio(renderer)
  layer.onRestore(() => {
    const old = scene.environment
    scene.environment = durexStudio(renderer)
    old?.dispose()
  })
  const key = new THREE.DirectionalLight('#ffffff', 1.4)
  key.position.set(-300, 500, 600)
  // A soft fill, so the latex's own cream reads in the dark room.
  scene.add(key, new THREE.HemisphereLight('#e2e8ff', '#1a1530', 0.7))

  const packet = createPacket(tier)
  packet.group.position.set(-48, 26, 0)
  scene.add(packet.group)
  const condom = createCondom(tier)
  condom.group.position.set(52, -60, 0)
  scene.add(condom.group)

  // A camera in millimetres, turned and zoomed by hand.
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 40000)
  camera.position.set(0, 20, 420)
  const controls = new OrbitControls(camera, layer.canvas)
  controls.enableDamping = true
  controls.target.set(0, 0, 0)
  // Framing follows the view until the visitor turns or zooms by hand.
  let framing = true
  controls.addEventListener('start', () => (framing = false))

  // --- Controls ----------------------------------------------------------
  const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!
  const unroll = $<HTMLInputElement>('[data-unroll]')
  const air = $<HTMLInputElement>('[data-air]')
  const unrollOut = $<HTMLOutputElement>('[data-unroll-out]')
  const airOut = $<HTMLOutputElement>('[data-air-out]')
  const spin = $<HTMLInputElement>('[data-spin]')
  const flip = $<HTMLButtonElement>('[data-flip]')
  let view: 'both' | 'packet' | 'condom' = 'both'
  let flipped = false

  const reshape = () => {
    framing = true
    condom.unroll = Number(unroll.value)
    condom.litres = Number(air.value)
    condom.update()
    unrollOut.textContent = `${Math.round(condom.unroll * 100)}%`
    // Air goes in once it is unrolled.
    air.disabled = condom.unroll < 0.999
    airOut.textContent = `${condom.volume.toFixed(1)} L`
  }
  unroll.addEventListener('input', reshape)
  air.addEventListener('input', reshape)
  flip.addEventListener('click', () => {
    flipped = !flipped
    flip.textContent = flipped ? 'Show the front' : 'Show the back'
  })
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    button.addEventListener('click', () => {
      framing = true
      view = button.dataset.view as typeof view
      for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b === button))
    })
  }

  // --- Frame, turn, render -----------------------------------------------
  const goal = new THREE.Vector3()
  let distance = 420
  let turn = 0
  stage.onFrame((frame) => {
    const dt = frame.delta
    if (spin.checked && !stage.reducedMotion.value) turn += dt * 0.35
    packet.group.rotation.set(0, turn + (flipped ? Math.PI : 0), 0)
    condom.group.rotation.set(0, turn * 0.6, 0)
    // Side by side: the condom's middle level with the packet's.
    condom.group.position.y = packet.group.position.y - (condom.top + condom.bottom) / 2
    // Keep what's asked for in frame: rolled up the condom is a ring high on
    // its own axis; blown up it is most of a metre tall.
    const h = condom.top - condom.bottom
    const condomCenter = new THREE.Vector3(condom.group.position.x, condom.group.position.y + (condom.top + condom.bottom) / 2, 0)
    if (view === 'packet') {
      goal.copy(packet.group.position)
      distance = 160
    } else if (view === 'condom') {
      goal.copy(condomCenter)
      distance = Math.max(200, h * 2.2, condom.width * 5)
    } else {
      goal.set((packet.group.position.x + condomCenter.x) / 2, (packet.group.position.y + condomCenter.y) / 2, 0)
      distance = Math.max(380, h * 2.4)
    }
    if (framing) {
      const k = 1 - Math.exp(-dt * 3)
      controls.target.lerp(goal, k)
      const offset = camera.position.clone().sub(controls.target)
      offset.setLength(offset.length() + (distance - offset.length()) * k)
      camera.position.copy(controls.target).add(offset)
    }
    controls.update()
    camera.aspect = layer.width / layer.height
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
  }, Phase.render + 1)

  reshape()
  // For the checks and close looks: shape it, and look from a direction at a distance.
  const look = (dir: [number, number, number], dist: number, on: 'packet' | 'condom' = 'condom') => {
    framing = false
    const center = on === 'packet' ? packet.group.position.clone() : new THREE.Vector3(condom.group.position.x, condom.group.position.y + (condom.top + condom.bottom) / 2, 0)
    controls.target.copy(center)
    camera.position.copy(center).add(new THREE.Vector3(...dir).setLength(dist))
    controls.update()
  }
  Object.assign(window, { __models: { stage, layer, packet, condom, camera, look, set: (u: number, l: number) => ((unroll.value = String(u)), (air.value = String(l)), reshape()) } })
}
