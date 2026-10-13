/**
 * The condom through the film: out of the packet as a ring, unrolled, blown
 * up — then let go, rocketing round the page as the air rushes out of the
 * open end until it drops, spent, to the floor; or tied, kept, a balloon
 * that floats along with you for the rest of the film and can be batted.
 *
 * While the chapters script it, it follows `pose`. Let go or tied, the
 * physics world moves it: a chain of spheres along its axis, re-measured
 * from the shape every frame, so it meets the screen's edges and the
 * headlines with its real size as it grows and shrinks.
 */
import * as THREE from 'three'
import { clamp, smoothstep, vec3, type Body, type PhysicsWorld, type Shape, type Stage } from '@veyra/core'
import type { ThreeLayer } from '@veyra/core/three'
import { createCondom, type Condom } from './condom'
import type { Tier } from './foil'

export type BalloonMode = 'scripted' | 'flying' | 'fallen' | 'tied'

export interface Balloon {
  readonly condom: Condom
  /** Placed by the pose (scripted) or by its body. */
  readonly group: THREE.Group
  readonly body: Body<'balloon'>
  readonly mode: BalloonMode
  /**
   * Scripted placement: where the shape's middle goes (px), how it turns, how
   * big (px per mm), and how flat it is pressed along its axis (0…1: in the
   * packet, the closed end lies folded flat inside the ring).
   */
  readonly pose: { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: number; flatten: number }
  /** Kept (tied), where it floats: px from the center, y up. */
  readonly home: THREE.Vector2
  /** Air left, as a share of what it held when let go (1 until then). */
  readonly pressure: number
  /** How fast the air is rushing out, 0…1. */
  readonly flow: number
  /** Let go: the air rushes out of the open end and drives it round the page. */
  letGo(): void
  /** Tie it: it keeps its air and floats along. */
  tie(): void
  /** Back to the script (scrolling back past the chapter). */
  reset(): void
  update(dt: number, time: number): void
  forces(h: number): void
  draw(): void
  dispose(): void
}

const SPHERES = 5
/** Pixels per second² the escaping air gives it at full pressure: light and fast. */
const THRUST = 4200
/** Let go, it shoots off away from us (drawn smaller), so it has the room to fly; kept, it floats at a companion's size. */
const AWAY = 0.42
const KEPT = 0.6

export function createBalloon(stage: Stage, layer: ThreeLayer, physics: PhysicsWorld, tier: Tier): Balloon {
  const condom = createCondom(tier)
  const group = new THREE.Group()
  // The shape's middle at the group's origin: the holder shifts it down.
  const holder = new THREE.Group()
  holder.add(condom.group)
  group.add(holder)
  group.visible = false

  const shapes: Shape[] = Array.from({ length: SPHERES }, () => ({ type: 'sphere' as const, radius: 1, offset: vec3() }))
  const body = physics.add<'balloon'>({
    shapes,
    mass: 1,
    restitution: 0.55,
    friction: 0.35,
    linearDamping: 1.1,
    angularDamping: 2.4,
    group: 2,
    mask: 4 | 8,
    userData: 'balloon',
  })
  body.enabled = false

  let mode: BalloonMode = 'scripted'
  let startLitres = 0
  let flightTime = 3
  let flown = 0
  let pressure = 1
  let flow = 0
  let center = 0
  let scale = 1
  let targetScale = 1
  let time = 0
  const pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: 1, flatten: 0 }
  const home = new THREE.Vector2()
  const F = vec3()
  const up = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const v = new THREE.Vector3()

  /** The sphere chain from the current outline (in px, about the shape's middle). */
  const fitShapes = () => {
    const { r, y } = condom.profile
    const lo = condom.bottom
    const hi = condom.top
    const step = (hi - lo) / SPHERES
    for (let k = 0; k < SPHERES; k++) {
      const yk = lo + step * (k + 0.5)
      let rk = 0
      for (let i = 0; i < r.length; i++) if (Math.abs(y[i]! - yk) <= step * 0.6) rk = Math.max(rk, r[i]!)
      const s = shapes[k]!
      if (s.type !== 'sphere') continue
      // Wide and short spheres would bulge past the ends: no more than the step allows.
      s.radius = Math.max(4, Math.min(rk, step * 0.75 + rk * 0.25)) * scale * 0.95
      s.offset!.x = 0
      s.offset!.y = (yk - center) * scale
      s.offset!.z = 0
    }
  }

  const begin = (next: BalloonMode) => {
    // Hand over from the script: start where it was.
    body.position.x = group.position.x
    body.position.y = group.position.y
    body.position.z = group.position.z
    body.quaternion.x = group.quaternion.x
    body.quaternion.y = group.quaternion.y
    body.quaternion.z = group.quaternion.z
    body.quaternion.w = group.quaternion.w
    body.velocity.x = body.velocity.y = body.velocity.z = 0
    body.angularVelocity.x = body.angularVelocity.y = body.angularVelocity.z = 0
    body.enabled = true
    body.kind = 'dynamic'
    mode = next
  }

  const self: Balloon = {
    condom,
    group,
    body,
    get mode() {
      return mode
    },
    pose,
    home,
    get pressure() {
      return pressure
    },
    get flow() {
      return flow
    },
    letGo() {
      if (mode !== 'scripted') return
      startLitres = Math.max(0.5, condom.litres)
      // Bigger balloons empty for longer.
      flightTime = 2.6 + 2.4 * smoothstep(4, 40, startLitres)
      flown = 0
      pressure = 1
      begin('flying')
      targetScale = scale * AWAY
      body.restitution = 0.55
      body.friction = 0.35
      body.linearDamping = 0.6
      // Free to tumble: the neck flapping turns it every which way.
      body.angularDamping = 1.1
      // A first kick, slightly off the axis, as the fingers let go.
      body.angularVelocity.x = (Math.random() - 0.5) * 5
      body.angularVelocity.z = (Math.random() - 0.5) * 5
    },
    tie() {
      if (mode !== 'scripted') return
      begin('tied')
      targetScale = scale * KEPT
      body.restitution = 0.7
      body.linearDamping = 1.6
      body.angularDamping = 2.4
    },
    reset() {
      mode = 'scripted'
      body.enabled = false
      pressure = 1
      flow = 0
    },
    update(dt, t) {
      time = t
      if (mode === 'flying') {
        flown += dt
        const left = clamp(1 - flown / flightTime)
        pressure = left ** 1.4
        flow = left ** 0.4 * (left > 0 ? 1 : 0)
        condom.litres = startLitres * pressure
        // Off one side of the screen, back in from the other.
        const w = layer.width
        const h = layer.height
        const r = Math.max(condom.top - condom.bottom, condom.width * 2) * scale * 0.5 + 24
        const p = body.position
        if (p.x > w / 2 + r) p.x -= w + 2 * r
        else if (p.x < -w / 2 - r) p.x += w + 2 * r
        if (p.y > h / 2 + r) p.y -= h + 2 * r
        else if (p.y < -h / 2 - r) p.y += h + 2 * r
        if (left <= 0) {
          mode = 'fallen'
          flow = 0
          condom.litres = 0
          // Spent: back inside the screen, where the walls are about to return.
          p.x = Math.max(-w / 2 + r, Math.min(w / 2 - r, p.x))
          p.y = Math.max(-h / 2 + r, Math.min(h / 2 - r, p.y))
          body.restitution = 0.2
          body.friction = 0.9
          body.linearDamping = 0.4
          body.angularDamping = 1.2
        }
      }
      condom.update()
      center = (condom.bottom + condom.top) / 2
      holder.position.y = -center
      if (mode === 'scripted') {
        scale = pose.scale
        group.position.copy(pose.position)
        group.quaternion.copy(pose.quaternion)
        group.scale.setScalar(scale)
        // Pressed flat about the ring (its plane), not about the middle.
        const flat = 1 - 0.88 * clamp(pose.flatten)
        holder.scale.set(1, flat, 1)
        holder.position.y = -center * flat
      } else {
        holder.scale.set(1, 1, 1)
        // Off it goes, away from us.
        scale += (targetScale - scale) * (1 - Math.exp(-dt / 0.3))
        fitShapes()
      }
    },
    forces(h) {
      if (mode === 'scripted') return
      const m = body.mass
      q.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
      up.set(0, 1, 0).applyQuaternion(q)
      F.x = F.y = F.z = 0
      if (mode === 'flying') {
        // The air rushes out of the open end (down the axis): it drives the balloon up its axis.
        const a = THRUST * flow
        F.x += up.x * a * m
        F.y += up.y * a * m
        F.z += up.z * a * m * 0.35
        // The neck flaps: it never flies straight, and it tumbles.
        const wob = 70 * flow
        body.angularVelocity.x += (Math.sin(time * 7.3) * Math.cos(time * 4.1) + Math.sin(time * 13.1 + 2) * 0.5) * wob * h
        body.angularVelocity.z += (Math.sin(time * 5.7 + 1) + Math.cos(time * 11.3) * 0.5) * wob * h
        body.angularVelocity.y += Math.cos(time * 3.1) * wob * 0.3 * h
        // A little weight: it arcs.
        F.y -= 260 * m
        // Seen from the side, mostly: its axis is eased back toward the screen's plane.
        body.angularVelocity.x += -up.y * up.z * 8 * h
        body.angularVelocity.y += up.x * up.z * 8 * h
        // Keep it in the slab the camera sees well.
        F.z += -body.position.z * 6 * m
      } else if (mode === 'fallen') {
        // Spent, it drops.
        F.y -= 2400 * m
        F.z += -body.position.z * 2 * m
      } else {
        // Tied: it floats at its home, bobbing; the hand bats it about.
        const w = layer.width
        const ht = layer.height
        const to = v.set(home.x, home.y + Math.sin(time * 0.7) * ht * 0.03, 0)
        F.x += (to.x - body.position.x) * 1.4 * m
        F.y += (to.y - body.position.y) * 1.4 * m
        F.z += (to.z - body.position.z) * 1.4 * m
        // Upright, like a balloon on a string.
        const tx = -up.z
        const tz = up.x
        body.angularVelocity.x += tx * 6 * h
        body.angularVelocity.z += tz * 6 * h
        const pointer = stage.pointer
        if (pointer?.inside) {
          const dx = body.position.x - (pointer.x - w / 2)
          const dy = body.position.y - (ht / 2 - pointer.y)
          const d = Math.hypot(dx, dy)
          const reach = Math.max(120, Math.min(w, ht) * 0.22)
          if (d < reach && d > 0.001) {
            const push = (1 - d / reach) ** 2 * 5200 * m
            F.x += (dx / d) * push
            F.y += (dy / d) * push
            body.angularVelocity.z += (-pointer.vx * 0.0006 + pointer.vy * 0.0002) * (1 - d / reach)
          }
        }
      }
      body.applyForce(F)
    },
    draw() {
      if (mode === 'scripted') return
      group.position.set(body.position.x, body.position.y, body.position.z)
      group.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
      group.scale.setScalar(scale)
    },
    dispose() {
      physics.remove(body)
      condom.dispose()
    },
  }
  return self
}
