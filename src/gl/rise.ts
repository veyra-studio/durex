/**
 * Play safe: dozens of balloons rising through the dark — blown-up condoms,
 * a few tinted in the packaging's colours — swaying as they go, parted by
 * the pointer. One shape, baked once from the condom at a few litres, and
 * instanced: two draws (the film's inside and outside) for all of them.
 */
import * as THREE from 'three'
import { clamp, lerp, seededRandom, type Stage } from '@veyra/core'
import type { ThreeLayer } from '@veyra/core/three'
import { createCondom } from './condom'
import type { Tier } from './foil'
import { createLatex } from './latex'

export interface Rise {
  /** 0…1: how many of them are let go (they rise in from below, one at a time). */
  amount: number
  update(dt: number, time: number): void
  /** None let go, none on the way. */
  reset(): void
  dispose(): void
}

const COUNT: Record<Tier, number> = { low: 12, medium: 22, high: 32 }
const TINTS = ['#ffffff', '#ffffff', '#ffffff', '#ffd0dc', '#d6dcff', '#fff1d6']

interface Floater {
  x: number
  z: number
  /** 0…1 of the way up: from just below the screen to just above it. */
  life: number
  /** Let go and on its way up. */
  active: boolean
  /** Of the way, per second (it takes 7–11 s to cross the screen). */
  speed: number
  size: number
  phase: number
  spin: number
  push: THREE.Vector2
  pushV: THREE.Vector2
}

export function createRise(stage: Stage, layer: ThreeLayer, tier: Tier): Rise {
  // Bake the shape: a balloon of about five litres.
  const baker = createCondom('medium')
  baker.unroll = 1
  baker.litres = 5
  baker.update()
  // (The clone keeps the stretch the shape had, so the film is as clear as it was blown.)
  const film = (baker.group.children[0] as THREE.Mesh).geometry.clone()
  const height = baker.top - baker.bottom
  const middle = (baker.top + baker.bottom) / 2
  film.translate(0, -middle, 0)
  baker.dispose()

  const latex = createLatex(tier)
  const max = COUNT.high
  const inside = new THREE.InstancedMesh(film, latex.inner, max)
  const outside = new THREE.InstancedMesh(film, latex.outer, max)
  inside.renderOrder = 1
  outside.renderOrder = 2
  const rand = seededRandom(19)
  const floaters: Floater[] = []
  const color = new THREE.Color()
  for (let i = 0; i < max; i++) {
    // Mostly to the sides, clear of the quote; the few in the middle far back.
    const middle = i % 5 === 0
    const side = rand() < 0.5 ? -1 : 1
    floaters.push({
      x: middle ? (rand() * 2 - 1) * 0.3 : side * (0.34 + rand() * 0.66),
      z: middle ? -900 - rand() * 400 : -150 - rand() * 900,
      life: 0,
      active: false,
      speed: 1 / (7 + rand() * 4),
      size: 0.75 + rand() * 0.5,
      phase: rand() * 10,
      spin: (rand() - 0.5) * 0.6,
      push: new THREE.Vector2(),
      pushV: new THREE.Vector2(),
    })
    color.set(TINTS[i % TINTS.length]!)
    inside.setColorAt(i, color)
    outside.setColorAt(i, color)
  }
  for (const m of [inside, outside]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.frustumCulled = false
    m.visible = false
    layer.scene.add(m)
  }
  let count = COUNT[tier]
  const stopTier = stage.quality?.tier.subscribe((t) => (count = COUNT[t]))
  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const s = new THREE.Vector3()

  // Balloons let go so far: one at a time, each from the very bottom.
  let released = 0
  let lastRelease = -Infinity

  const self: Rise = {
    amount: 0,
    update(dt, t) {
      const w = layer.width
      const h = layer.height
      const camZ = layer.distance
      const reduced = stage.reducedMotion.value
      // A balloon is about a sixth of the screen's height at z = 0 — on a phone, smaller, fewer and further back.
      const narrow = w < 760
      const base = Math.min(h * 0.17, w * (narrow ? 0.2 : 1)) / height
      const back = narrow ? -380 : 0
      const n = narrow ? Math.ceil(count * 0.6) : count
      // As many as the chapter asks for, released in turn; asked for fewer, the ones up already finish their way.
      const want = Math.round(clamp(self.amount) * n)
      if (released < want && (reduced || t - lastRelease > 0.22)) {
        const f = floaters[released]!
        f.active = true
        // Without motion they simply stand in the air, spread out.
        f.life = reduced ? 0.15 + ((released * 0.618) % 1) * 0.7 : 0
        released++
        lastRelease = t
      }
      if (released > want) released = want
      let shown = 0
      const pointer = stage.pointer
      for (let i = 0; i < max; i++) {
        const f = floaters[i]!
        if (f.active && !reduced) {
          f.life += f.speed * dt
          if (f.life >= 1) {
            // Round again from the bottom — or done, if no longer wanted.
            if (i < released && i < n) f.life -= 1
            else f.active = false
          }
        } else if (f.active && (i >= released || i >= n)) f.active = false
        if (!f.active) {
          m.makeScale(0, 0, 0)
          inside.setMatrixAt(i, m)
          outside.setMatrixAt(i, m)
          continue
        }
        shown++
        const z = f.z + back
        const depth = camZ / Math.max(1, camZ - z)
        // From just below the screen to just above it, as the eye sees it at its depth.
        const tall = height * base * f.size * depth
        const y = lerp(-h / 2 - tall * 0.65, h / 2 + tall * 0.65, f.life) / depth
        const x = (f.x * w * 0.6) / depth + Math.sin(t * 0.6 + f.phase) * 18
        // The hand parts them: a spring on screen.
        if (pointer?.inside && !reduced) {
          const k = depth
          const dx = x * k + f.push.x - (pointer.x - w / 2)
          const dy = y * k + f.push.y - (h / 2 - pointer.y)
          const d = Math.hypot(dx, dy)
          const reach = Math.min(w, h) * 0.2
          if (d < reach && d > 0.001) {
            f.pushV.x += (dx / d) * (1 - d / reach) * 900 * dt
            f.pushV.y += (dy / d) * (1 - d / reach) * 900 * dt
          }
        }
        f.pushV.multiplyScalar(Math.exp(-2.2 * dt))
        f.pushV.addScaledVector(f.push, -3 * dt)
        f.push.addScaledVector(f.pushV, dt)
        p.set(x + f.push.x / depth, y + f.push.y / depth, z)
        q.setFromEuler(e.set(Math.sin(t * 0.5 + f.phase) * 0.12, t * f.spin + f.phase, Math.sin(t * 0.4 + f.phase * 2) * 0.1))
        m.compose(p, q, s.setScalar(base * f.size))
        inside.setMatrixAt(i, m)
        outside.setMatrixAt(i, m)
      }
      inside.visible = outside.visible = shown > 0
      inside.count = outside.count = max
      inside.instanceMatrix.needsUpdate = outside.instanceMatrix.needsUpdate = true
    },
    reset() {
      for (const f of floaters) f.active = false
      released = 0
      lastRelease = -Infinity
      self.amount = 0
      inside.visible = outside.visible = false
    },
    dispose() {
      stopTier?.()
      film.dispose()
      latex.dispose()
      inside.dispose()
      outside.dispose()
    },
  }
  return self
}
