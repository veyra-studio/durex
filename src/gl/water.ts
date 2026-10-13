/**
 * Tested: a condom filled with water, hanging by its rim — Durex's leak
 * test, «suspended for one minute». Poke it and the drop swings from the rim
 * and wobbles, the water sloshing inside: a pendulum and a squash, each a
 * lightly damped spring. The water is a surface just inside the film, below
 * the waterline, with a meniscus that tilts against the swing.
 */
import * as THREE from 'three'
import { clamp } from '@veyra/core'
import { createCondom, CONDOM, type Condom } from './condom'
import type { Tier } from './foil'

export interface WaterTest {
  /** Its rim is the group's origin: place it (px) and size it (px per mm). */
  readonly group: THREE.Group
  readonly condom: Condom
  /** Litres of water. */
  readonly litres: number
  /** A push: `strength` 0…1, `direction` −1 (from the left) … 1. */
  poke(strength: number, direction: number): void
  /** Swing (rad) and squash (−1…1), for checks and sound. */
  readonly swing: number
  readonly squash: number
  update(dt: number, time: number, reduced: boolean): void
  dispose(): void
}

const LITRES = 1.4

export function createWater(tier: Tier): WaterTest {
  const condom = createCondom(tier)
  condom.unroll = 1
  condom.water = LITRES
  condom.update()

  // The water: the film's own surface a hair inside it, below the waterline.
  const uWaterline = { value: 0 }
  const water = new THREE.MeshPhysicalMaterial({
    color: '#a9d8ff',
    roughness: 0.04,
    metalness: 0,
    ior: 1.33,
    transparent: true,
    opacity: 0.34,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.5,
    depthWrite: false,
    side: THREE.BackSide,
  })
  water.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterline = uWaterline
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHeight;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeight = position.y;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWaterline;\nvarying float vHeight;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vHeight < uWaterline) discard;')
  }
  water.customProgramCacheKey = () => 'durex-water'
  const film = condom.group.children[0] as THREE.Mesh
  const body = new THREE.Mesh(film.geometry, water)
  body.renderOrder = 1.5
  body.scale.set(0.97, 1, 0.97)
  body.frustumCulled = false
  // The surface of the water, seen through the neck.
  const surface = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: '#cfeaff', roughness: 0.02, transparent: true, opacity: 0.4, clearcoat: 1, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide }),
  )
  surface.renderOrder = 1.6

  // Teat down, hanging by the rim: the holder flips the condom over.
  const holder = new THREE.Group()
  holder.rotation.x = Math.PI
  holder.add(condom.group, body, surface)
  const group = new THREE.Group()
  group.add(holder)

  // Where the drop begins: going up from the rim, the first row wider than the tube.
  const { r, y } = condom.profile
  let line = 0
  for (let i = r.length - 1; i >= 0; i--) {
    if (r[i]! > CONDOM.radius * 1.12) {
      line = y[i]!
      break
    }
  }
  uWaterline.value = line + 4
  let widest = 0
  for (let i = 0; i < r.length; i++) if (Math.abs(y[i]! - (line + 4)) < 3) widest = Math.max(widest, r[i]!)
  surface.position.y = line + 4
  surface.scale.setScalar(Math.max(4, widest * 0.95))

  // Swing about the rim (x and z) and squash, as springs.
  const swing = { x: 0, z: 0, vx: 0, vz: 0 }
  const squash = { s: 0, v: 0 }
  const SWING = (2 * Math.PI * 0.85) ** 2
  const SQUASH = (2 * Math.PI * 2.3) ** 2

  const self: WaterTest = {
    group,
    condom,
    litres: LITRES,
    get swing() {
      return Math.hypot(swing.x, swing.z)
    },
    get squash() {
      return squash.s
    },
    poke(strength, direction) {
      const k = clamp(strength)
      swing.vz += -direction * 1.6 * k
      swing.vx += (Math.random() - 0.5) * 0.8 * k
      squash.v += 2.6 * k
    },
    update(dt, t, reduced) {
      const h = Math.min(dt, 1 / 30)
      if (reduced) {
        swing.x = swing.z = swing.vx = swing.vz = 0
        squash.s = squash.v = 0
      } else {
        // A breath of air moves it even untouched.
        const idle = Math.sin(t * 0.9) * 0.012
        swing.vx += (-SWING * swing.x - 0.9 * swing.vx) * h
        swing.vz += (-SWING * (swing.z - idle) - 0.9 * swing.vz) * h
        swing.x += swing.vx * h
        swing.z += swing.vz * h
        squash.v += (-SQUASH * squash.s - 2.2 * squash.v) * h
        squash.s += squash.v * h
      }
      holder.rotation.set(Math.PI + swing.x, 0, swing.z)
      // The drop squashes and stretches about its volume.
      const s = clamp(squash.s, -0.35, 0.35) * 0.18
      holder.scale.set(1 / Math.sqrt(1 - s), 1 - s, 1 / Math.sqrt(1 - s))
      // The water lags the swing.
      surface.rotation.set(-swing.x * 0.7, 0, -swing.z * 0.7)
    },
    dispose() {
      condom.dispose()
      water.dispose()
      surface.geometry.dispose()
      ;(surface.material as THREE.Material).dispose()
    },
  }
  return self
}
