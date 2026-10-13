/**
 * The film's three.js world: foil packets floating weightless in the dark —
 * each on a soft spring to a drifting home, turning slowly, pushed aside by
 * the pointer and set spinning by a quick pass — and one that comes forward
 * to show both its faces. Packets keep out of the copy on screen (`state.clear`),
 * so the words always read. Chapters write `state`; this module moves and draws.
 * Units: CSS pixels through the layer's pixel camera; packets are modelled
 * in millimetres and drawn at `px per mm`.
 */
import * as THREE from 'three'
import { clamp, lerp, seededRandom, smoothstep, type Stage } from '@veyra/core'
import { threeLayer, type ThreeLayer } from '@veyra/core/three'
import { createPacketParts, PACKET, type PacketParts, type Tier } from './foil'
import { durexStudio } from './light'

export interface WorldState {
  /** 0…1: the cloud of floating packets (0 scatters them out of view). */
  cloud: number
  /** 0…1: the featured packet comes forward. */
  feature: number
  /** The featured packet: its turn (radians), place (CSS px from the center, y up) and size (px per mm). */
  turn: number
  x: number
  y: number
  scale: number
  /** Places on screen the packets keep out of: the copy, so the words always read. */
  clear: Zone[]
}

/** A place on screen packets keep out of: CSS px from the viewport's top left, `amount` 0…1. */
export interface Zone {
  left: number
  top: number
  right: number
  bottom: number
  amount: number
}

export interface World {
  layer: ThreeLayer
  state: WorldState
  /** Bodies drawn in the cloud (follows the quality tier). */
  readonly count: number
  /** The tier the packets' geometry and textures were built for. */
  readonly detail: Tier
  /** Packets showing whose centre is inside a zone that's fully on (for checks). */
  inZones(): number
  dispose(): void
}

interface Body {
  /** Home: x, y as fractions of the viewport from its center; z in px. */
  home: THREE.Vector3
  pos: THREE.Vector3
  vel: THREE.Vector3
  q: THREE.Quaternion
  spin: THREE.Vector3
  /** A slow turn it always comes back to. */
  drift: THREE.Vector3
  phase: number
  size: number
  /** How much of it shows (0…1, the cloud's entrance). */
  shown: number
}

const MAX = 14
const COUNT: Record<Tier, number> = { low: 6, medium: 10, high: 14 }

const way = { x: 0, y: 0 }
/** The shortest way out of a zone (screen px, y down) for a point that needs `room` px around it; zero when it's clear. */
function wayOut(zone: Zone, x: number, y: number, room: number) {
  way.x = way.y = 0
  const left = x - zone.left + room
  const right = zone.right + room - x
  const up = y - zone.top + room
  const down = zone.bottom + room - y
  if (left <= 0 || right <= 0 || up <= 0 || down <= 0) return way
  const nearest = Math.min(left, right, up, down)
  if (nearest === left) way.x = -left
  else if (nearest === right) way.x = right
  else if (nearest === up) way.y = -up
  else way.y = down
  return way
}

export function createWorld(stage: Stage): World {
  const layer = stage.use(threeLayer({ fov: 32, zIndex: 0, stableHeight: true }))
  // Read once the layer exists: on a software renderer (no GPU) it has just lowered the stage's quality.
  const tier: Tier = stage.quality?.tier.value ?? 'medium'
  const { renderer, scene } = layer
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.NeutralToneMapping
  // Shader compile logs wait for the driver: only in development and captures.
  renderer.debug.checkShaderErrors = import.meta.env.DEV || new URLSearchParams(location.search).has('capture')
  scene.environment = durexStudio(renderer)
  layer.onRestore(() => {
    const old = scene.environment
    scene.environment = durexStudio(renderer)
    old?.dispose()
  })
  const key = new THREE.DirectionalLight('#ffffff', 1.3)
  key.position.set(-400, 600, 900)
  scene.add(key, new THREE.HemisphereLight('#e2e8ff', '#1a1530', 0.6))

  const parts: PacketParts = createPacketParts(tier)
  const front = new THREE.InstancedMesh(parts.smallFront, parts.frontMaterial, MAX)
  const back = new THREE.InstancedMesh(parts.smallBack, parts.backMaterial, MAX)
  for (const m of [front, back]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.frustumCulled = false
    scene.add(m)
  }
  const featured = new THREE.Group()
  featured.add(new THREE.Mesh(parts.front, parts.frontMaterial), new THREE.Mesh(parts.back, parts.backMaterial))
  scene.add(featured)

  // A loose ring of packets around the middle, deep and shallow, clear of
  // the headline (the near ones, which loom larger, further out).
  const rand = seededRandom(7)
  const bodies: Body[] = []
  for (let i = 0; i < MAX; i++) {
    const a = i * 2.39996 + 0.4
    const z = -650 + rand() * 820
    const r = 0.36 + rand() * 0.14 + Math.max(0, z) / 2200
    const home = new THREE.Vector3(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.85, z)
    bodies.push({
      home,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6, rand() * 6, rand() * 6)),
      spin: new THREE.Vector3(),
      drift: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.5),
      phase: rand() * 10,
      size: 0.8 + rand() * 0.4,
      shown: 0,
    })
  }
  let count = COUNT[tier]
  // The cloud thins and fills as the tier changes.
  const stopTier = stage.quality?.tier.subscribe((t) => (count = COUNT[t]))
  let placed = false

  const state: WorldState = { cloud: 0, feature: 0, turn: 0, x: 0, y: 0, scale: 6, clear: [] }
  const m = new THREE.Matrix4()
  const s = new THREE.Vector3()
  const target = new THREE.Vector3()
  const dq = new THREE.Quaternion()
  const axis = new THREE.Vector3()
  const zero = new THREE.Vector3()

  stage.onFrame((frame) => {
    const dt = Math.min(frame.delta, 1 / 20)
    const t = frame.time
    const reduced = stage.reducedMotion.value
    const w = layer.width
    const h = layer.height
    // Packets are sized to the screen: about a fifth of its smaller side at z = 0.
    const base = (Math.min(w, h) * 0.2) / PACKET.size
    const pointer = stage.pointer
    const camZ = layer.distance
    const px = pointer && pointer.inside ? pointer.x - w / 2 : 1e9
    const py = pointer && pointer.inside ? h / 2 - pointer.y : 1e9

    for (let i = 0; i < count; i++) {
      const b = bodies[i]!
      // Each arrives in turn, and leaves outward when the cloud scatters.
      const show = smoothstep(i / count / 2, i / count / 2 + 0.5, state.cloud)
      const out = 1 - show
      // Homes are places on screen: far packets sit wider so perspective doesn't pull them in.
      const depth = camZ / Math.max(1, camZ - b.home.z)
      target.set((b.home.x * w * (1 + out * 1.4)) / depth, (b.home.y * h * (1 + out * 1.4)) / depth, b.home.z - out * 900)
      if (!reduced) target.add(s.set(Math.sin(t * 0.13 + b.phase) * 26, Math.cos(t * 0.11 + b.phase) * 20, Math.sin(t * 0.07 + b.phase) * 60))
      // The words come first: a home inside a zone (with room for the packet) moves out by its nearest side.
      const kt = camZ / Math.max(1, camZ - target.z)
      for (const zone of state.clear) {
        if (zone.amount < 0.001) continue
        const o = wayOut(zone, w / 2 + target.x * kt, h / 2 - target.y * kt, PACKET.size * base * b.size * kt * 0.6)
        target.x += (o.x * zone.amount) / kt
        target.y -= (o.y * zone.amount) / kt
      }
      if (!placed || reduced) b.pos.copy(target)
      else {
        // Zero gravity: a soft spring home, a little drag.
        b.vel.addScaledVector(s.copy(target).sub(b.pos), 1.1 * dt).multiplyScalar(Math.exp(-1.3 * dt))
        // The hand pushes them aside (measured on screen, where the eye sees them).
        const k = camZ / Math.max(1, camZ - b.pos.z)
        const dx = b.pos.x * k - px
        const dy = b.pos.y * k - py
        const d = Math.hypot(dx, dy)
        const reach = Math.min(w, h) * 0.24
        if (d < reach && d > 0.001) {
          const push = (1 - d / reach) ** 2 * 2600 * dt
          b.vel.x += (dx / d) * push
          b.vel.y += (dy / d) * push
          if (pointer) b.spin.add(s.set(-pointer.vy, pointer.vx, 0).multiplyScalar(0.00045 * (1 - d / reach)))
        }
        // …and they're quick to make room when the words arrive (the soft spring alone takes seconds).
        for (const zone of state.clear) {
          if (zone.amount < 0.001) continue
          const o = wayOut(zone, w / 2 + b.pos.x * k, h / 2 - b.pos.y * k, PACKET.size * base * b.size * k * 0.6)
          b.vel.x += (o.x * zone.amount * 6 * dt) / k
          b.vel.y -= (o.y * zone.amount * 6 * dt) / k
        }
        b.pos.addScaledVector(b.vel, dt)
      }
      // Turning: a slow drift it returns to, whatever spin the hand gave it.
      b.spin.lerp(reduced ? zero : b.drift, 1 - Math.exp(-0.8 * dt))
      const angle = b.spin.length() * dt
      if (angle > 1e-6) b.q.premultiply(dq.setFromAxisAngle(axis.copy(b.spin).normalize(), angle))
      b.shown = show
      const size = base * b.size * show
      m.compose(b.pos, b.q, s.set(size, size, size))
      front.setMatrixAt(i, m)
      back.setMatrixAt(i, m)
    }
    placed = true
    front.count = back.count = count
    front.instanceMatrix.needsUpdate = back.instanceMatrix.needsUpdate = true

    // The featured packet: in from deep behind, turning to show both faces.
    const f = clamp(state.feature)
    featured.visible = f > 0.001
    if (featured.visible) {
      const e = f * f * (3 - 2 * f)
      featured.position.set(lerp(state.x * 0.6, state.x, e), lerp(state.y - h * 0.2, state.y, e), lerp(-1400, 0, e))
      featured.rotation.set(0.18 * Math.sin(t * 0.4) * (reduced ? 0 : 1), state.turn, 0.06)
      featured.scale.setScalar(state.scale * e)
    }
  }, 50)

  return {
    layer,
    state,
    get count() {
      return count
    },
    detail: tier,
    inZones() {
      const camZ = layer.distance
      let n = 0
      for (let i = 0; i < count; i++) {
        const b = bodies[i]!
        if (b.shown < 0.2) continue
        const k = camZ / Math.max(1, camZ - b.pos.z)
        const sx = layer.width / 2 + b.pos.x * k
        const sy = layer.height / 2 - b.pos.y * k
        if (state.clear.some((z) => z.amount > 0.99 && sx > z.left && sx < z.right && sy > z.top && sy < z.bottom)) n++
      }
      return n
    },
    dispose() {
      stopTier?.()
      parts.dispose()
      front.dispose()
      back.dispose()
    },
  }
}
