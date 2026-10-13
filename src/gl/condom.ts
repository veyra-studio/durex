/**
 * The condom: Durex Invisible's shape — straight-walled, a teat at the
 * closed end, a rolled rim at the open one — 180 mm long and 54 mm in
 * nominal width (34.4 mm across), in clear natural latex.
 *
 * One surface of revolution follows the film from the teat's pole to the
 * rim, sampled at even steps of its own length, so the same film can be
 * rolled up into the ring (the rest wound into a torus), unrolled, and blown
 * up like a balloon: the closed end swells first and the bulb spreads down
 * toward the rim as air goes in. The latex thins as it stretches (the
 * `aStretch` attribute the latex material reads), and the volume reported
 * is integrated from the shape itself, so a gauge reading it is honest.
 * Units: millimetres; the open end at y = 0, the teat up (+y).
 */
import * as THREE from 'three'
import { clamp, lerp, smoothstep } from '@veyra/core'
import type { Tier } from './foil'
import { createLatex, type Latex } from './latex'

export const CONDOM = {
  /** From the teat's pole to the open end. */
  length: 180,
  /** Nominal width 54 mm laid flat: a tube 34.4 mm across. */
  radius: 54 / Math.PI,
  teatRadius: 5.4,
  /** The teat's straight part. */
  teat: 13,
  /** The shoulder from the teat out to the wall. */
  shoulder: 12,
  /** The rim's bead, unrolled. */
  bead: 1.1,
  /** Film thickness, for how fat the roll is. */
  film: 0.055,
} as const

/** The relaxed film as a profile (radius, height) at even steps along its length. */
interface Film {
  r: Float64Array
  y: Float64Array
  /** Arc length from the pole. */
  s: Float64Array
  length: number
  /** Where the teat ends and the wall begins (arc length). */
  teatEnd: number
  wallStart: number
}

function relaxedFilm(rows: number): Film {
  const { length: L, radius: R, teatRadius: T, teat, shoulder } = CONDOM
  const pts: Array<[number, number]> = []
  // The pole: a quarter circle.
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * (Math.PI / 2)
    pts.push([T * Math.sin(a), L - T * (1 - Math.cos(a))])
  }
  const y0 = L - T
  for (let i = 1; i <= 20; i++) pts.push([T, y0 - (teat * i) / 20])
  // The shoulder: out from the teat to the wall, upright at both ends.
  const y1 = y0 - teat
  for (let i = 1; i <= 48; i++) {
    const u = i / 48
    pts.push([T + (R - T) * u * u * (3 - 2 * u), y1 - shoulder * u])
  }
  const y2 = y1 - shoulder
  for (let i = 1; i <= 160; i++) pts.push([R, y2 - (y2 * i) / 160])
  // Arc length along the outline.
  const acc = [0]
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]))
  const total = acc[acc.length - 1]!
  const at = (s: number): [number, number] => {
    let i = 1
    while (i < acc.length - 1 && acc[i]! < s) i++
    const t = (s - acc[i - 1]!) / Math.max(1e-9, acc[i]! - acc[i - 1]!)
    return [lerp(pts[i - 1]![0], pts[i]![0], t), lerp(pts[i - 1]![1], pts[i]![1], t)]
  }
  const r = new Float64Array(rows)
  const y = new Float64Array(rows)
  const s = new Float64Array(rows)
  for (let i = 0; i < rows; i++) {
    s[i] = (total * i) / (rows - 1)
    ;[r[i], y[i]] = at(s[i]!)
  }
  const teatEnd = acc[24 + 20]!
  const wallStart = acc[24 + 20 + 48]!
  return { r, y, s, length: total, teatEnd, wallStart }
}

export interface Condom {
  /** The film (both passes) and the rim. */
  group: THREE.Group
  /** Unrolled, 0…1: 0 is the ring from the packet, 1 the whole length. */
  unroll: number
  /** Air to blow in, in litres (when unrolled). */
  litres: number
  /** The air the shape holds, in litres, integrated from it at the last `update()`. */
  readonly volume: number
  /**
   * Where the shape is, for framing (mm, local): its lowest and highest
   * points and its widest radius. Rolled up it sits high on its own axis —
   * the open end of the unrolled film is y = 0 — and comes down as it unrolls.
   */
  readonly bottom: number
  readonly top: number
  readonly width: number
  /** Rebuilds the surface from `unroll` and `litres`. */
  update(): void
  dispose(): void
}

export function createCondom(tier: Tier): Condom {
  const ROWS = tier === 'low' ? 150 : 260
  const SEG = tier === 'high' ? 96 : tier === 'medium' ? 72 : 48
  const film = relaxedFilm(ROWS)
  const { radius: R, teatRadius: T } = CONDOM

  // --- The film's surface --------------------------------------------------
  const cols = SEG + 1
  const positions = new Float32Array(ROWS * cols * 3)
  const normals = new Float32Array(ROWS * cols * 3)
  const stretch = new Float32Array(ROWS * cols)
  const uvs = new Float32Array(ROWS * cols * 2)
  const index: number[] = []
  const cos = new Float32Array(cols)
  const sin = new Float32Array(cols)
  for (let j = 0; j < cols; j++) {
    const a = (j / SEG) * Math.PI * 2
    cos[j] = Math.cos(a)
    sin[j] = Math.sin(a)
  }
  for (let i = 0; i < ROWS; i++) {
    for (let j = 0; j < cols; j++) {
      uvs[(i * cols + j) * 2] = j / SEG
      uvs[(i * cols + j) * 2 + 1] = 1 - i / (ROWS - 1)
      if (i < ROWS - 1 && j < SEG) {
        const a = i * cols + j
        const b = a + cols
        index.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('aStretch', new THREE.BufferAttribute(stretch, 1).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(index)

  // Relaxed film creases; blown up, it is smooth.
  const latex = createLatex(tier, { wrinkles: 0.18 })
  const inside = new THREE.Mesh(geometry, latex.inner)
  const outside = new THREE.Mesh(geometry, latex.outer)
  inside.renderOrder = 1
  outside.renderOrder = 2
  // The surface changes shape every frame it moves: no stale bounds.
  inside.frustumCulled = outside.frustumCulled = false

  // --- The rim: the rolled film, or the bead once unrolled -----------------
  const TUBE = 18
  const AROUND = SEG
  const rimPositions = new Float32Array((AROUND + 1) * (TUBE + 1) * 3)
  const rimNormals = new Float32Array(rimPositions.length)
  const rimIndex: number[] = []
  for (let u = 0; u < AROUND; u++) {
    for (let v = 0; v < TUBE; v++) {
      const a = u * (TUBE + 1) + v
      const b = (u + 1) * (TUBE + 1) + v
      rimIndex.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const rimGeometry = new THREE.BufferGeometry()
  rimGeometry.setAttribute('position', new THREE.BufferAttribute(rimPositions, 3).setUsage(THREE.DynamicDrawUsage))
  rimGeometry.setAttribute('normal', new THREE.BufferAttribute(rimNormals, 3).setUsage(THREE.DynamicDrawUsage))
  rimGeometry.setIndex(rimIndex)
  // A roll of film: many layers in the line of sight, a satin finish.
  const rimLatex: Latex = createLatex(tier, { layers: 9, satin: true })
  const rimInside = new THREE.Mesh(rimGeometry, rimLatex.inner)
  const rimOutside = new THREE.Mesh(rimGeometry, rimLatex.outer)
  rimInside.renderOrder = 1
  rimOutside.renderOrder = 2
  rimInside.frustumCulled = rimOutside.frustumCulled = false

  const group = new THREE.Group()
  group.add(inside, outside, rimInside, rimOutside)

  const pr = new Float64Array(ROWS)
  const py = new Float64Array(ROWS)

  /** The bulb that holds `litres`: its widest radius and its height (mm). */
  const bulbFor = (litres: number, scale: number) => {
    // Height over widest radius: a ball while small (2 is round), a long
    // balloon once full.
    const aspect = lerp(2.3, 5.2, smoothstep(0.5, 40, litres))
    const rb = Math.cbrt((litres * 1e6) / (0.55 * Math.PI * aspect)) * scale
    return { rb: Math.max(rb, R * 1.04), hb: Math.max(rb, R * 1.04) * aspect }
  }

  let volume = 0
  let bottom = 0
  let top: number = CONDOM.length
  let width: number = R

  const self: Condom = {
    group,
    unroll: 0,
    litres: 0,
    get volume() {
      return volume
    },
    get bottom() {
      return bottom
    },
    get top() {
      return top
    },
    get width() {
      return width
    },
    update() {
      const unroll = clamp(self.unroll)
      // How much film is unrolled; the rest is wound into the rim.
      const S = lerp(film.wallStart, film.length, unroll)
      let last = ROWS - 1
      while (last > 0 && film.s[last]! > S) last--
      // The rim glides down the wall with the film, between rows.
      const next = Math.min(ROWS - 1, last + 1)
      const yRim = lerp(film.y[last]!, film.y[next]!, clamp((S - film.s[last]!) / Math.max(1e-9, film.s[next]! - film.s[last]!)))
      // Fresh from the packet the closed end sags: a low dome inside the ring.
      const sag = lerp(0.45, 1, smoothstep(0, 0.12, unroll))
      for (let i = 0; i < ROWS; i++) {
        if (i <= last) {
          pr[i] = film.r[i]!
          py[i] = yRim + (film.y[i]! - yRim) * sag
        } else {
          // Wound into the rim (hidden inside it).
          pr[i] = R
          py[i] = yRim
        }
      }

      // Air: a bulb from the closed end down to a front that reaches the rim
      // by about 12 litres, then the whole balloon grows.
      const air = unroll >= 0.999 ? Math.max(0, self.litres) : 0
      if (air > 0.01) {
        const front = lerp(film.wallStart * 1.15, film.length, smoothstep(0.05, 12, air)) / film.length
        const qTeat = film.teatEnd / film.length
        let scale = 1
        for (let pass = 0; pass < 3; pass++) {
          const { rb, hb } = bulbFor(air, scale)
          const iFront = Math.min(ROWS - 1, Math.round(front * (ROWS - 1)))
          const base = film.y[iFront]!
          for (let i = 0; i <= iFront; i++) {
            const q = i / (ROWS - 1)
            if (q < qTeat) {
              // The teat rides on top, a little swollen.
              pr[i] = film.r[i]! * 1.25
              py[i] = base + hb + (film.y[i]! - film.y[Math.round(qTeat * (ROWS - 1))]!) * 1.15
            } else {
              // 0 at the front (where the tube goes on), 1 at the teat.
              // (Clamped: the row nearest the front may lie a hair past it.)
              const t = clamp((front - q) / Math.max(1e-6, front - qTeat))
              const end = lerp(R, T * 1.25, t)
              pr[i] = end + (rb - end) * Math.sin(Math.PI * t ** 0.85) ** 0.6
              py[i] = base + hb * t
            }
          }
          // How much it holds, from the shape itself.
          let v = 0
          for (let i = 0; i < ROWS - 1; i++) {
            const rr = (pr[i]! + pr[i + 1]!) / 2
            v += Math.PI * rr * rr * Math.abs(py[i]! - py[i + 1]!)
          }
          // Correct the bulb's size toward the air asked for.
          scale *= Math.cbrt(Math.max(1e-6, (air * 1e6) / Math.max(1, v)))
          if (pass === 2) volume = v / 1e6
        }
      } else {
        let v = 0
        for (let i = 0; i < last; i++) {
          const rr = (pr[i]! + pr[i + 1]!) / 2
          v += Math.PI * rr * rr * Math.abs(py[i]! - py[i + 1]!)
        }
        volume = v / 1e6
      }

      // Write the surface: positions, normals from the profile's slope, stretch.
      // Unrolled and empty, latex is limp: the tube lies a little flattened
      // and gently bent (the rim holds its end round); air rounds it out.
      const limp = smoothstep(0.25, 0.7, unroll) * (1 - smoothstep(0.05, 1.5, air))
      top = -Infinity
      bottom = Infinity
      width = 0
      for (let i = 0; i < ROWS; i++) {
        const a = Math.max(0, i - 1)
        const b = Math.min(ROWS - 1, i + 1)
        let dr = pr[b]! - pr[a]!
        let dy = py[b]! - py[a]!
        const len = Math.hypot(dr, dy) || 1
        dr /= len
        dy /= len
        // Outward: the slope turned a quarter (pole → rim runs downward).
        const nr = -dy
        const ny = dr
        // Area stretch against the relaxed film.
        const relaxedSpacing = Math.hypot(film.r[b]! - film.r[a]!, film.y[b]! - film.y[a]!) || 1
        const along = i <= last ? Math.hypot(pr[b]! - pr[a]!, py[b]! - py[a]!) / relaxedSpacing : 1
        const around = film.r[i]! > 0.01 ? pr[i]! / film.r[i]! : along
        const st = Math.max(1, along * around)
        top = Math.max(top, py[i]!)
        bottom = Math.min(bottom, py[i]!)
        width = Math.max(width, pr[i]!)
        const w = limp * smoothstep(0, 28, py[i]! - yRim)
        const sx = 1 + 0.3 * w
        const sz = 1 - 0.42 * w
        const u = (py[i]! - yRim) / CONDOM.length
        const bendX = w * 6 * Math.sin(Math.PI * u)
        const bendZ = w * 3 * Math.sin(2 * Math.PI * u + 0.6)
        for (let j = 0; j < cols; j++) {
          const o = (i * cols + j) * 3
          positions[o] = pr[i]! * cos[j]! * sx + bendX
          positions[o + 1] = py[i]!
          positions[o + 2] = pr[i]! * sin[j]! * sz + bendZ
          // A squashed circle's normals lean the other way (inverse scale).
          const nx = (nr * cos[j]!) / sx
          const nz = (nr * sin[j]!) / sz
          const nl = Math.hypot(nx, ny, nz) || 1
          normals[o] = nx / nl
          normals[o + 1] = ny / nl
          normals[o + 2] = nz / nl
          stretch[i * cols + j] = st
        }
      }
      geometry.attributes.position!.needsUpdate = true
      geometry.attributes.normal!.needsUpdate = true
      geometry.attributes.aStretch!.needsUpdate = true

      // The rim: as fat as the film still wound into it.
      const wound = film.length - S
      const minor = Math.sqrt(CONDOM.bead ** 2 + (wound * CONDOM.film * 1.6) / Math.PI)
      const major = R + minor * 0.85
      for (let u = 0; u <= AROUND; u++) {
        const ca = Math.cos((u / AROUND) * Math.PI * 2)
        const sa = Math.sin((u / AROUND) * Math.PI * 2)
        for (let v = 0; v <= TUBE; v++) {
          const cb = Math.cos((v / TUBE) * Math.PI * 2)
          const sb = Math.sin((v / TUBE) * Math.PI * 2)
          const o = (u * (TUBE + 1) + v) * 3
          rimPositions[o] = (major + minor * cb) * ca
          rimPositions[o + 1] = yRim + minor * sb
          rimPositions[o + 2] = (major + minor * cb) * sa
          rimNormals[o] = cb * ca
          rimNormals[o + 1] = sb
          rimNormals[o + 2] = cb * sa
        }
      }
      rimGeometry.attributes.position!.needsUpdate = true
      rimGeometry.attributes.normal!.needsUpdate = true
      width = Math.max(width, major + minor)
      bottom = Math.min(bottom, yRim - minor)
      top = Math.max(top, yRim + minor)
    },
    dispose() {
      geometry.dispose()
      rimGeometry.dispose()
      latex.dispose()
      rimLatex.dispose()
    },
  }
  self.update()
  return self
}
