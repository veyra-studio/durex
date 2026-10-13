/**
 * The foil packet: a square of printed aluminium foil sealed by crimped
 * seams on all four sides, its edges cut in a zigzag (the tear edge), and
 * pillowed over the rolled condom inside — a ring-shaped ridge where the
 * rim is, a flat middle with the teat's bump, slack foil sloping from the
 * ring down to the seams, crumpled the way handled foil always is.
 * Everything is generated: the shape, the crinkles, the artwork on both
 * faces. Units: millimetres; the packet lies in the xy plane, front to +z.
 */
import * as THREE from 'three'
import { clamp, createNoise, lerp, smoothstep, type Noise } from '@veyra/core'
import { colors } from '../palette'

export type Tier = 'low' | 'medium' | 'high'

export const PACKET = {
  /** Side of the square. */
  size: 54,
  /** Width of the crimped seam along each edge. */
  seal: 4.8,
  /** The zigzag cut: pitch and depth of its teeth. */
  pitch: 2.4,
  depth: 1.1,
  /** Where the rolled rim inside pushes the foil up (the roll's tube, see condom.ts), and how high. */
  ringRadius: 19,
  ringHeight: 2.2,
  /** The flat middle: the closed end, folded down. */
  middle: 0.95,
} as const

const HALF = PACKET.size / 2
/** Fonts the artwork is set in (load them before building a packet). */
export const PACKET_FONTS = ['800 40px "Nunito Variable"', '600 40px "Geist Variable"', '400 40px "Geist Variable"'] as const

/** Distance from (x, y) to the nearest edge of the square, inward. */
const edgeDistance = (x: number, y: number) => Math.min(HALF - Math.abs(x), HALF - Math.abs(y))

/** One face's height above the packet's mid-plane, before crumples. */
function pillow(x: number, y: number, under: boolean): number {
  const inside = edgeDistance(x, y) - PACKET.seal
  if (inside <= 0) return 0
  const r = Math.hypot(x, y)
  const R = PACKET.ringRadius
  const H = PACKET.ringHeight * (under ? 0.92 : 1)
  // Over the rolled rim: a rounded ridge.
  const ridge = H * Math.exp(-(((r - R) / 2.6) ** 2))
  // Inside it: the closed end folded flat, the teat's bump in the middle (front only).
  const middle = r < R ? lerp(PACKET.middle, H, smoothstep(R - 8, R, r) ** 2) + (under ? 0 : 0.6 * Math.exp(-((r / 3.2) ** 2))) : 0
  // Outside it: slack foil from the ridge down to the seam.
  const out = r - R
  const slope = out > 0 ? H * clamp(1 - out / (out + inside)) ** 1.7 : 0
  return Math.max(ridge, middle, slope) * smoothstep(0, 2.4, inside)
}

/** A face: a dense plane lifted into the pillow, crumpled; the underside turned to face −z. */
function faceGeometry(segments: number, under: boolean, noise: Noise): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(PACKET.size, PACKET.size, segments, segments)
  const position = geometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const inside = edgeDistance(x, y) - PACKET.seal
    const crumple = noise.fbm2(x * 0.085 + (under ? 31.7 : 0), y * 0.085, { octaves: 3 }) * 0.24 * smoothstep(0, 3, inside)
    // A hair off the mid-plane, so the two faces never coincide at the seam.
    position.setZ(i, 0.04 + pillow(x, y, under) + crumple)
  }
  geometry.computeVertexNormals()
  if (under) geometry.rotateY(Math.PI)
  return geometry
}

// ---------------------------------------------------------------------------
// Artwork: colour, roughness/metalness (green/blue, three.js's channels) and
// the crinkles' normals, drawn per face at `k` pixels per millimetre.
// ---------------------------------------------------------------------------

/** The zigzag outline of the cut foil. */
function outline(ctx: CanvasRenderingContext2D, k: number): void {
  const px = (x: number) => (x + HALF) * k
  const py = (y: number) => (HALF - y) * k
  const n = Math.round(PACKET.size / PACKET.pitch)
  const step = PACKET.size / n
  const d = PACKET.depth
  ctx.beginPath()
  ctx.moveTo(px(-HALF), py(HALF))
  // Top edge (left to right), right edge (down), bottom (right to left), left (up).
  for (let i = 0; i < n; i++) {
    const x = -HALF + i * step
    ctx.lineTo(px(x + step / 2), py(HALF - d))
    ctx.lineTo(px(x + step), py(HALF))
  }
  for (let i = 0; i < n; i++) {
    const y = HALF - i * step
    ctx.lineTo(px(HALF - d), py(y - step / 2))
    ctx.lineTo(px(HALF), py(y - step))
  }
  for (let i = 0; i < n; i++) {
    const x = HALF - i * step
    ctx.lineTo(px(x - step / 2), py(-HALF + d))
    ctx.lineTo(px(x - step), py(-HALF))
  }
  for (let i = 0; i < n; i++) {
    const y = -HALF + i * step
    ctx.lineTo(px(-HALF + d), py(y + step / 2))
    ctx.lineTo(px(-HALF), py(y + step))
  }
  ctx.closePath()
}

const canvas = (size: number) => {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

/** The Durex-style mark: a lowercase wordmark in a pill. */
function mark(ctx: CanvasRenderingContext2D, k: number, x: number, y: number, width: number, color: string): void {
  const h = width * 0.4
  const cx = (x + HALF) * k
  const cy = (HALF - y) * k
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width * 0.045 * k
  ctx.beginPath()
  ctx.roundRect(cx - (width / 2) * k, cy - (h / 2) * k, width * k, h * k, (h / 2) * k)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = `800 ${width * 0.27 * k}px "Nunito Variable", "Nunito", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('durex', cx, cy - width * 0.012 * k)
  ctx.restore()
}

function text(ctx: CanvasRenderingContext2D, k: number, value: string, x: number, y: number, size: number, weight: number, color: string, tracking = 0): void {
  ctx.save()
  ctx.fillStyle = color
  ctx.font = `${weight} ${size * k}px "Geist Variable", "Geist", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (tracking) ctx.letterSpacing = `${tracking * size * k}px`
  ctx.fillText(value, (x + HALF) * k, (HALF - y) * k)
  ctx.restore()
}

/** Roughness (green) and metalness (blue) as a colour for the PBR map. */
const pbr = (roughness: number, metalness: number) => `rgb(0, ${Math.round(roughness * 255)}, ${Math.round(metalness * 255)})`

/**
 * Both faces' artwork; the ink differs, the foil and the cut are the same.
 * The colour is drawn at `size`, roughness/metalness at half of it.
 */
function artwork(face: 'front' | 'back', size: number): { color: HTMLCanvasElement; pbr: HTMLCanvasElement } {
  const color = canvas(size)
  const material = canvas(size / 2)
  const c = color.getContext('2d')!
  const m = material.getContext('2d')!
  // Draw both in millimetres scaled to their own resolution.
  const kc = size / PACKET.size
  const km = size / 2 / PACKET.size
  for (const [ctx, k] of [
    [c, kc],
    [m, km],
  ] as const) {
    outline(ctx, k)
    ctx.clip()
  }
  // Bare foil: the cut edge and, on the back, most of the face.
  c.fillStyle = colors.silver
  c.fillRect(0, 0, size, size)
  // Brushed, not mirrored: bare foil catches broad light even in a dark room.
  m.fillStyle = pbr(0.34, 1)
  m.fillRect(0, 0, size, size)
  const frame = PACKET.depth + 0.7
  const inner = (ctx: CanvasRenderingContext2D, k: number) => ctx.fillRect(frame * k, frame * k, (PACKET.size - 2 * frame) * k, (PACKET.size - 2 * frame) * k)
  if (face === 'front') {
    // Navy ink over the face, a hair short of the cut; deeper toward the
    // edges, like a printed vignette.
    const glow = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.42)
    glow.addColorStop(0, colors.navy)
    glow.addColorStop(1, colors.navyDeep)
    c.fillStyle = glow
    inner(c, kc)
    m.fillStyle = pbr(0.36, 0.6)
    inner(m, km)
    // White ink: the mark, the line's name, the small print.
    for (const [ctx, ink, k] of [
      [c, colors.white, kc],
      [m, pbr(0.5, 0.1), km],
    ] as const) {
      mark(ctx, k, 0, 3.2, 25, ink)
      text(ctx, k, 'INVISIBLE', 0, -7.6, 3.1, 600, ink, 0.32)
      text(ctx, k, 'natural rubber latex condom', 0, -12.4, 1.35, 400, ink, 0.06)
      text(ctx, k, 'TEAR HERE ›', 15.5, HALF - 2.5, 1.25, 600, ink, 0.18)
    }
  } else {
    // Navy ink on bare foil.
    for (const [ctx, ink, k] of [
      [c, colors.navy, kc],
      [m, pbr(0.36, 0.6), km],
    ] as const) {
      mark(ctx, k, 0, 6.5, 16, ink)
      text(ctx, k, 'INVISIBLE', 0, 0, 2.3, 600, ink, 0.32)
      text(ctx, k, 'Natural rubber latex condom. For single use.', 0, -5, 1.3, 400, ink, 0.02)
      text(ctx, k, '‹ TEAR HERE', -15.5, HALF - 2.5, 1.25, 600, ink, 0.18)
    }
  }
  return { color, pbr: material }
}

/**
 * The foil's relief, as a normal map: the crimped seams (fine ridges across
 * each edge) and the crinkles of the foil in between.
 */
function reliefNormals(size: number, noise: Noise): HTMLCanvasElement {
  const k = size / PACKET.size
  const height = new Float32Array(size * size)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) / k - HALF
      const y = HALF - (j + 0.5) / k
      const inside = edgeDistance(x, y) - PACKET.seal
      let h: number
      if (inside < 0) {
        // Crimp ridges across the seam (both ways in the corners).
        const alongTop = Math.abs(y) > Math.abs(x)
        const along = alongTop ? x : y
        const ridges = 0.5 + 0.5 * Math.sin((along / 0.62) * Math.PI * 2)
        const corner = HALF - Math.abs(x) < PACKET.seal && HALF - Math.abs(y) < PACKET.seal
        h = corner ? 0.5 * ridges + 0.5 * (0.5 + 0.5 * Math.sin(((alongTop ? y : x) / 0.62) * Math.PI * 2)) : ridges
        h *= 0.55
      } else {
        // Crinkles: sharp creases (ridged noise) over a soft wrinkle.
        const crease = 1 - Math.abs(noise.fbm2(x * 0.32, y * 0.32, { octaves: 4 }))
        h = crease ** 4 * 0.9 + noise.fbm2(x * 1.4 + 9, y * 1.4, { octaves: 2 }) * 0.08
        h *= smoothstep(0, 1.2, inside)
      }
      height[j * size + i] = h
    }
  }
  const out = canvas(size)
  const ctx = out.getContext('2d')!
  const image = ctx.createImageData(size, size)
  const strength = 2.2
  const at = (a: number, b: number) => height[Math.min(size - 1, Math.max(0, b)) * size + Math.min(size - 1, Math.max(0, a))]!
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = (at(i + 1, j) - at(i - 1, j)) * strength
      const dy = (at(i, j - 1) - at(i, j + 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      const o = (j * size + i) * 4
      image.data[o] = ((-dx / len) * 0.5 + 0.5) * 255
      image.data[o + 1] = ((-dy / len) * 0.5 + 0.5) * 255
      image.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255
      image.data[o + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return out
}

export interface PacketParts {
  front: THREE.BufferGeometry
  back: THREE.BufferGeometry
  /** The same faces, coarser, for packets seen small (the cloud). */
  smallFront: THREE.BufferGeometry
  smallBack: THREE.BufferGeometry
  frontMaterial: THREE.MeshPhysicalMaterial
  backMaterial: THREE.MeshPhysicalMaterial
  dispose(): void
}

/**
 * Geometry and materials for packets, shared by every packet drawn (single
 * meshes or instances): front and back faces, each with its own artwork.
 */
export function createPacketParts(tier: Tier): PacketParts {
  const segments = tier === 'high' ? 150 : tier === 'medium' ? 110 : 70
  // A packet a couple of hundred pixels across needs far fewer: finer, and its triangles are under a pixel.
  const smallSegments = tier === 'high' ? 64 : tier === 'medium' ? 48 : 32
  // The front is seen close; the back mostly as it turns away.
  const frontSize = tier === 'high' ? 2048 : 1024
  const backSize = 1024
  const noise = createNoise(23)
  const front = faceGeometry(segments, false, noise)
  const back = faceGeometry(segments, true, noise)
  const smallFront = faceGeometry(smallSegments, false, noise)
  const smallBack = faceGeometry(smallSegments, true, noise)
  const normals = new THREE.CanvasTexture(reliefNormals(tier === 'high' ? 1024 : 512, noise))
  const textures: THREE.Texture[] = [normals]
  const material = (face: 'front' | 'back') => {
    const art = artwork(face, face === 'front' ? frontSize : backSize)
    const map = new THREE.CanvasTexture(art.color)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    const surface = new THREE.CanvasTexture(art.pbr)
    textures.push(map, surface)
    return new THREE.MeshPhysicalMaterial({
      map,
      roughnessMap: surface,
      metalnessMap: surface,
      roughness: 1,
      metalness: 1,
      normalMap: normals,
      normalScale: new THREE.Vector2(0.55, 0.55),
      // The cut: the zigzag lives in the artwork's alpha.
      alphaTest: 0.5,
      // A lacquer over the print; brushed highlights along the foil's grain.
      clearcoat: 0.35,
      clearcoatRoughness: 0.22,
      anisotropy: tier === 'low' ? 0 : 0.45,
      envMapIntensity: 1.15,
    })
  }
  const frontMaterial = material('front')
  const backMaterial = material('back')
  return {
    front,
    back,
    smallFront,
    smallBack,
    frontMaterial,
    backMaterial,
    dispose() {
      front.dispose()
      back.dispose()
      smallFront.dispose()
      smallBack.dispose()
      frontMaterial.dispose()
      backMaterial.dispose()
      for (const t of textures) t.dispose()
    },
  }
}

/** A single packet: both faces in a group (its own copy of the parts). */
export function createPacket(tier: Tier): { group: THREE.Group; parts: PacketParts; dispose(): void } {
  const parts = createPacketParts(tier)
  const group = new THREE.Group()
  group.add(new THREE.Mesh(parts.front, parts.frontMaterial), new THREE.Mesh(parts.back, parts.backMaterial))
  return { group, parts, dispose: () => parts.dispose() }
}
