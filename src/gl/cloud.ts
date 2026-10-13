/**
 * The cloud: foil packets floating weightless. Each is a box in the physics
 * world on a soft spring to a drifting home, so packets that meet knock into
 * each other and spin off instead of passing through; the pointer pushes
 * them aside and sets them turning, and they keep out of the copy (zones).
 * Sized to the screen; how many follows the quality tier.
 */
import * as THREE from 'three'
import { seededRandom, smoothstep, vec3, type Body, type PhysicsWorld, type Stage } from '@veyra/core'
import type { ThreeLayer } from '@veyra/core/three'
import { PACKET, type PacketParts, type Tier } from './foil'

/** A place on screen packets keep out of: CSS px from the viewport's top left, `amount` 0…1. */
export interface Zone {
  left: number
  top: number
  right: number
  bottom: number
  amount: number
}

const MAX = 14
const COUNT: Record<Tier, number> = { low: 6, medium: 10, high: 14 }
/** Half the packet's thickness for collisions, in mm (the pillow over the ring is about 4.5 mm). */
const THICK = 2.4

interface Packet {
  body: Body
  /** Home: x, y as fractions of the viewport from its center; z in px. */
  home: THREE.Vector3
  /** A slow turn it always comes back to (rad/s). */
  drift: THREE.Vector3
  phase: number
  size: number
  shown: number
  target: THREE.Vector3
  /** Pixels per millimetre it is drawn at. */
  scale: number
  /** Seconds since it came in (its spring is stiff for the first moments: it sweeps in, then floats). */
  since: number
}

export interface Cloud {
  /** 0…1: the cloud's presence (0 scatters the packets out of view). */
  amount: number
  readonly count: number
  /** Before the physics step: homes, sizes and what the pointer does. */
  update(dt: number, time: number, zones: readonly Zone[]): void
  /** Each substep: springs home, the pointer's push, the zones' push. */
  forces(h: number): void
  /** After the physics step: draw where the bodies are. */
  draw(): void
  /** Packets showing whose centre is inside a zone that's fully on (for checks). */
  inZones(zones: readonly Zone[]): number
  /** Sets how hard each new knock between two packets is heard. */
  onKnock(fn: (strength: number, x: number) => void): void
  dispose(): void
}

export function createCloud(stage: Stage, layer: ThreeLayer, physics: PhysicsWorld, parts: PacketParts, tier: Tier): Cloud {
  const front = new THREE.InstancedMesh(parts.smallFront, parts.frontMaterial, MAX)
  const back = new THREE.InstancedMesh(parts.smallBack, parts.backMaterial, MAX)
  for (const m of [front, back]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.frustumCulled = false
    layer.scene.add(m)
  }

  // A loose ring of packets around the middle, deep and shallow, clear of
  // the headline (the near ones, which loom larger, further out).
  const rand = seededRandom(7)
  const packets: Packet[] = []
  for (let i = 0; i < MAX; i++) {
    const a = i * 2.39996 + 0.4
    const z = -650 + rand() * 820
    const r = 0.36 + rand() * 0.14 + Math.max(0, z) / 2200
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6, rand() * 6, rand() * 6))
    const body = physics.add<'packet'>({
      shape: { type: 'box', half: vec3(1, 1, 0.1) },
      quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
      linearDamping: 1.3,
      restitution: 0.35,
      friction: 0.25,
      userData: 'packet',
    })
    packets.push({
      body,
      home: new THREE.Vector3(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.85, z),
      drift: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.5),
      phase: rand() * 10,
      size: 0.8 + rand() * 0.4,
      shown: 0,
      target: new THREE.Vector3(),
      scale: 0,
      since: 99,
    })
  }
  let count = COUNT[tier]
  // The cloud thins and fills as the tier changes.
  const stopTier = stage.quality?.tier.subscribe((t) => (count = COUNT[t]))

  let placed = false
  let zonesNow: readonly Zone[] = []
  let knock: ((strength: number, x: number) => void) | null = null
  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const F = vec3()

  const way = { x: 0, y: 0 }
  /** The shortest way out of a zone (screen px, y down) for a point needing `room` around it; zero when clear. */
  const wayOut = (zone: Zone, x: number, y: number, room: number) => {
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

  physics.onContact((c) => {
    if (!knock || !c.began || c.a === c.b) return
    const a = c.a as Body
    if (a.userData !== 'packet' || c.b.userData !== 'packet') return
    knock(Math.min(1, c.speed / 500), c.point.x / Math.max(1, layer.width / 2))
  })

  const self: Cloud = {
    amount: 0,
    get count() {
      return count
    },
    update(dt, t, zones) {
      zonesNow = zones
      const reduced = stage.reducedMotion.value
      const w = layer.width
      const h = layer.height
      const camZ = layer.distance
      // Packets are sized to the screen: about a fifth of its smaller side at z = 0.
      const base = (Math.min(w, h) * 0.2) / PACKET.size
      const pointer = stage.pointer
      for (let i = 0; i < MAX; i++) {
        const pk = packets[i]!
        const b = pk.body
        // Each arrives in turn, and leaves outward when the cloud scatters.
        const show = i < count ? smoothstep(i / count / 2, i / count / 2 + 0.5, self.amount) : 0
        const out = 1 - show
        pk.shown = show
        pk.scale = base * pk.size * show
        const was = b.enabled
        b.enabled = show > 0.02
        const box = b.shapes[0]!
        if (box.type === 'box') {
          box.half.x = box.half.y = (PACKET.size / 2) * pk.scale
          box.half.z = THICK * pk.scale
        }
        b.mass = pk.size * pk.size
        // Homes are places on screen: far packets sit wider so perspective doesn't pull them in.
        // Away (the cloud thinning), they are out past the sides of the screen.
        const depth = camZ / Math.max(1, camZ - pk.home.z)
        const tg = pk.target.set((pk.home.x * w * (1 + out * 2.8)) / depth, (pk.home.y * h * (1 + out * 0.6)) / depth, pk.home.z - out * 200)
        if (!reduced) tg.add(s.set(Math.sin(t * 0.13 + pk.phase) * 26, Math.cos(t * 0.11 + pk.phase) * 20, Math.sin(t * 0.07 + pk.phase) * 60))
        // The words come first: a home inside a zone (with room for the packet) moves out by its nearest side.
        const kt = camZ / Math.max(1, camZ - tg.z)
        for (const zone of zones) {
          if (zone.amount < 0.001) continue
          const o = wayOut(zone, w / 2 + tg.x * kt, h / 2 - tg.y * kt, PACKET.size * base * pk.size * kt * 0.6)
          tg.x += (o.x * zone.amount) / kt
          tg.y -= (o.y * zone.amount) / kt
        }
        if (!placed || reduced || !b.enabled) {
          b.position.x = tg.x
          b.position.y = tg.y
          b.position.z = tg.z
          b.velocity.x = b.velocity.y = b.velocity.z = 0
        }
        // Coming in, it sweeps in from its side (a stiff spring for a moment), tumbling.
        if (!was && b.enabled) {
          pk.since = 0
          if (!reduced) {
            b.angularVelocity.x += (Math.random() - 0.5) * 5
            b.angularVelocity.y += (Math.random() - 0.5) * 5
          }
        } else pk.since += dt
        // Turning: a slow drift it returns to, whatever spin a knock or the hand gave it.
        const av = b.angularVelocity
        const k = 1 - Math.exp(-0.8 * dt)
        const dx = reduced ? 0 : pk.drift.x
        const dy = reduced ? 0 : pk.drift.y
        const dz = reduced ? 0 : pk.drift.z
        av.x += (dx - av.x) * k
        av.y += (dy - av.y) * k
        av.z += (dz - av.z) * k
        // A quick pass of the hand sets a packet spinning.
        if (pointer && pointer.inside && b.enabled && !reduced) {
          const kp = camZ / Math.max(1, camZ - b.position.z)
          const d = Math.hypot(b.position.x * kp - (pointer.x - w / 2), b.position.y * kp - (h / 2 - pointer.y))
          const reach = Math.min(w, h) * 0.24
          if (d < reach) {
            av.x += -pointer.vy * 0.00045 * (1 - d / reach)
            av.y += pointer.vx * 0.00045 * (1 - d / reach)
          }
        }
      }
      placed = true
    },
    forces() {
      const w = layer.width
      const h = layer.height
      const camZ = layer.distance
      const pointer = stage.pointer
      const px = pointer && pointer.inside ? pointer.x - w / 2 : 1e9
      const py = pointer && pointer.inside ? h / 2 - pointer.y : 1e9
      const reach = Math.min(w, h) * 0.24
      for (let i = 0; i < count; i++) {
        const pk = packets[i]!
        const b = pk.body
        if (!b.enabled) continue
        const mass = b.mass
        // Zero gravity: a soft spring home (the drag is the body's damping) — stiff and well
        // damped for a moment as it sweeps in, so it arrives quickly and barely overshoots.
        const sweep = 1 - smoothstep(0.35, 1.3, pk.since)
        const stiff = (1.1 + 15 * sweep) * mass
        const damp = 4 * sweep * mass
        F.x = (pk.target.x - b.position.x) * stiff - b.velocity.x * damp
        F.y = (pk.target.y - b.position.y) * stiff - b.velocity.y * damp
        F.z = (pk.target.z - b.position.z) * stiff - b.velocity.z * damp
        // The hand pushes them aside (measured on screen, where the eye sees them).
        const k = camZ / Math.max(1, camZ - b.position.z)
        const dx = b.position.x * k - px
        const dy = b.position.y * k - py
        const d = Math.hypot(dx, dy)
        if (d < reach && d > 0.001) {
          const push = (1 - d / reach) ** 2 * 2600 * mass
          F.x += (dx / d) * push
          F.y += (dy / d) * push
        }
        // …and they're quick to make room when the words arrive (the soft spring alone takes seconds).
        for (const zone of zonesNow) {
          if (zone.amount < 0.001) continue
          const o = wayOut(zone, w / 2 + b.position.x * k, h / 2 - b.position.y * k, PACKET.size * pk.scale * k * 0.6)
          F.x += (o.x * zone.amount * 6 * mass) / k
          F.y -= (o.y * zone.amount * 6 * mass) / k
        }
        b.applyForce(F)
      }
    },
    draw() {
      for (let i = 0; i < MAX; i++) {
        const pk = packets[i]!
        const b = pk.body
        p.set(b.position.x, b.position.y, b.position.z)
        q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)
        m.compose(p, q, s.setScalar(i < count ? pk.scale : 0))
        front.setMatrixAt(i, m)
        back.setMatrixAt(i, m)
      }
      front.count = back.count = count
      front.instanceMatrix.needsUpdate = back.instanceMatrix.needsUpdate = true
    },
    inZones(zones) {
      const camZ = layer.distance
      let n = 0
      for (let i = 0; i < count; i++) {
        const pk = packets[i]!
        if (pk.shown < 0.2) continue
        const b = pk.body
        const k = camZ / Math.max(1, camZ - b.position.z)
        const sx = layer.width / 2 + b.position.x * k
        const sy = layer.height / 2 - b.position.y * k
        if (zones.some((z) => z.amount > 0.99 && sx > z.left && sx < z.right && sy > z.top && sy < z.bottom)) n++
      }
      return n
    },
    onKnock(fn) {
      knock = fn
    },
    dispose() {
      stopTier?.()
      for (const pk of packets) physics.remove(pk.body)
      front.dispose()
      back.dispose()
    },
  }
  return self
}
