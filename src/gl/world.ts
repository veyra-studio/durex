/**
 * The film's three.js world, one canvas behind the page: the cloud of
 * packets, the featured packet that is torn open, the condom from ring to
 * balloon, the water test and the finale's balloons — in one physics world,
 * so packets knock into each other and a balloon let go bounces off the
 * screen's edges and the headlines. Chapters write `state` (and let the
 * balloon go); this module places, moves and draws.
 * Units: CSS pixels through the layer's pixel camera; models are built in
 * millimetres and drawn at pixels per millimetre.
 */
import * as THREE from 'three'
import { clamp, domColliders, lerp, PhysicsWorld, smoothstep, vec3, type Body, type ContactEvent, type Stage } from '@veyra/core'
import { threeLayer, type ThreeLayer } from '@veyra/core/three'
import { createBalloon, type Balloon } from './balloon'
import { createCloud, type Cloud, type Zone } from './cloud'
import { CONDOM } from './condom'
import { createFeatured, type Featured } from './featured'
import { createPacketParts, PACKET, type Tier } from './foil'
import { durexStudio } from './light'
import { createRise, type Rise } from './rise'
import { createWater, type WaterTest } from './water'

export type { Zone } from './cloud'

export interface WorldState {
  /** 0…1: the cloud of floating packets (0 scatters them out of view). */
  cloud: number
  /** 0…1: the featured packet comes forward (and back, leaving). */
  feature: number
  /** The featured packet: its turn (radians), place (px from the center, y up) and size (px per mm). */
  turn: number
  x: number
  y: number
  scale: number
  /** 01 — the tear, right to left, and the strip's flight, 0…1. */
  tear: number
  fly: number
  /** The ring out of the packet: 0 inside, ½ out of the opening, 1 free in front of it. */
  ring: number
  /** 02 — unrolled, 0…1. */
  unroll: number
  /** 03 — litres pumped in. */
  litres: number
  /** Where the condom stands (px from the center, y up) and its height on screen (share of the viewport's). */
  standX: number
  standY: number
  standHeight: number
  /** 05 — the water test: 0…1 there, and where its rim hangs (px from the center). */
  water: number
  waterX: number
  waterY: number
  /** 06 — the rising balloons, 0…1. */
  rise: number
  /** Places on screen packets keep out of (the copy). */
  clear: Zone[]
}

export interface World {
  layer: ThreeLayer
  state: WorldState
  physics: PhysicsWorld
  /** Packets drawn in the cloud (follows the quality tier). */
  readonly count: number
  /** The tier the packets' geometry and textures were built for. */
  readonly detail: Tier
  /** After `more()`: the condom's chapters. */
  readonly balloon: Balloon | null
  readonly waterTest: WaterTest | null
  /** Builds the condom's chapters (call once the opening has played). */
  more(): Promise<void>
  /** Elements the balloon bounces off (their boxes follow the page). */
  collide(elements: Element[]): void
  /** Packets showing whose centre is inside a zone that's fully on (for checks). */
  inZones(): number
  /** The water drop on screen (px from the top left): where to poke it. */
  waterOnScreen(): { x: number; y: number; r: number } | null
  /** Two packets knocked together (strength 0…1, x −1…1 across the screen). */
  onKnock(fn: (strength: number, x: number) => void): void
  /** The balloon hit something: strength 0…1, and the element if it was one of the page's. */
  onBump(fn: (strength: number, element: Element | null) => void): void
  dispose(): void
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

  // CSS pixels: half a pixel of overlap is nothing; slow touches don't bounce.
  const physics = new PhysicsWorld({ substeps: 3, iterations: 6, slop: 0.5, correction: 0.25, maxCorrection: 600, bounceThreshold: 30 })
  const parts = createPacketParts(tier)
  const cloud: Cloud = createCloud(stage, layer, physics, parts, tier)

  const featured: Featured = createFeatured(parts)
  scene.add(featured.group)
  // The featured packet pushes the cloud aside as it comes through.
  const featuredBody: Body = physics.add({ kind: 'kinematic', shape: { type: 'box', half: vec3(1, 1, 1) }, group: 16, mask: 1 })

  // The balloon's walls: the screen's edges, a floor, and a slab in depth.
  const walls = {
    left: physics.addPlane(vec3(1, 0, 0), 0, { group: 8, mask: 2, restitution: 0.6 }),
    right: physics.addPlane(vec3(-1, 0, 0), 0, { group: 8, mask: 2, restitution: 0.6 }),
    top: physics.addPlane(vec3(0, -1, 0), 0, { group: 8, mask: 2, restitution: 0.6 }),
    floor: physics.addPlane(vec3(0, 1, 0), 0, { group: 8, mask: 2, restitution: 0.3, friction: 0.9 }),
    front: physics.addPlane(vec3(0, 0, -1), -220, { group: 8, mask: 2 }),
    back: physics.addPlane(vec3(0, 0, 1), -500, { group: 8, mask: 2 }),
  }

  let balloon: Balloon | null = null
  let waterTest: WaterTest | null = null
  let rise: Rise | null = null
  let building: Promise<void> | null = null
  let bump: ((strength: number, element: Element | null) => void) | null = null

  const state: WorldState = {
    cloud: 0,
    feature: 0,
    turn: 0,
    x: 0,
    y: 0,
    scale: 6,
    tear: 0,
    fly: 0,
    ring: 0,
    unroll: 0,
    litres: 0,
    standX: 0,
    standY: 0,
    standHeight: 0.6,
    water: 0,
    waterX: 0,
    waterY: 0,
    rise: 0,
    clear: [],
  }

  physics.onContact((c: ContactEvent) => {
    if (!bump || c.b.userData !== 'balloon' || !c.began) return
    const a = c.a as Body
    bump(Math.min(1, c.speed / 900), a.userData instanceof Element ? a.userData : null)
  })

  // Scratch.
  const last = new THREE.Vector3()
  const v = new THREE.Vector3()
  // Free of the packet, the ring faces us (a little turned, so it reads as a ring); unrolled, it stands.
  const facing = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.35, 0.25, 0))
  const upright = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, -0.06))
  // In the packet it lies flat, its closed end toward the front.
  const intoPacket = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
  // The packet as it stood, before it drops away: the ring comes out of it there, and stays clear of it.
  const anchor = new THREE.Object3D()
  const fromPacket = new THREE.Quaternion()
  const standing = new THREE.Quaternion()
  const wobble = new THREE.Quaternion()
  const tilt = new THREE.Euler()
  let shown = false
  let pumpWobble = 0
  let pumpWobbleV = 0
  let lastLitres = 0
  let standScale = 1

  stage.onFrame((frame) => {
    const dt = Math.min(frame.delta, 1 / 20)
    const t = frame.time
    const reduced = stage.reducedMotion.value
    const w = layer.width
    const h = layer.height

    // The walls follow the screen, a little inside it. In flight there are none: off one side, back in
    // from the other (the balloon wraps round); spent, it drops to the floor.
    walls.left.offset = -w / 2 + 10
    walls.right.offset = -w / 2 + 10
    walls.top.offset = -h / 2 + 10
    walls.floor.offset = -h / 2 + 8
    const flying = balloon?.mode === 'flying'
    walls.left.enabled = walls.right.enabled = walls.top.enabled = walls.floor.enabled = !flying

    // --- The cloud ---------------------------------------------------------
    cloud.amount = state.cloud
    cloud.update(dt, t, state.clear)

    // --- The featured packet: in from deep behind, turning to show both faces.
    const f = clamp(state.feature)
    featured.group.visible = f > 0.001
    featuredBody.enabled = featured.group.visible
    if (featured.group.visible) {
      const e = f * f * (3 - 2 * f)
      last.copy(featured.group.position)
      featured.group.position.set(lerp(state.x * 0.6, state.x, e), lerp(state.y - h * 0.2, state.y, e), lerp(-1400, 0, e))
      featured.group.rotation.set(0.18 * Math.sin(t * 0.4) * (reduced ? 0 : 1), state.turn, 0.06)
      featured.group.scale.setScalar(state.scale * e)
      featured.tear = state.tear
      featured.fly = state.fly
      featured.update()
      // Its collider, for the cloud.
      const s = state.scale * e
      const box = featuredBody.shapes[0]!
      if (box.type === 'box') {
        box.half.x = box.half.y = (PACKET.size / 2) * s
        box.half.z = 2.4 * s
      }
      const p = featured.group.position
      featuredBody.position.x = p.x
      featuredBody.position.y = p.y
      featuredBody.position.z = p.z
      const q = featured.group.quaternion
      featuredBody.quaternion.x = q.x
      featuredBody.quaternion.y = q.y
      featuredBody.quaternion.z = q.z
      featuredBody.quaternion.w = q.w
      v.subVectors(p, last).divideScalar(Math.max(1e-3, dt))
      featuredBody.velocity.x = v.x
      featuredBody.velocity.y = v.y
      featuredBody.velocity.z = v.z
    }

    // --- The condom, ring to balloon -----------------------------------------
    if (balloon) {
      const b = balloon
      const c = b.condom
      const narrow = w < 760
      if (b.mode === 'scripted') {
        c.unroll = state.unroll
        c.litres = state.unroll >= 0.999 ? state.litres : 0
      }
      const ring = clamp(state.ring)
      // Into the next chapters only a kept (tied) balloon comes along; the rest stays behind.
      b.group.visible = ring > 0.001 && (b.mode === 'tied' || (state.water < 0.05 && state.rise < 0.05))
      // Kept, it floats beside the copy — and beside the water test, not over it.
      const aside = smoothstep(0.2, 0.8, state.water)
      b.home.set(lerp(narrow ? w * 0.18 : w * 0.3, narrow ? w * 0.3 : w * 0.42, aside), lerp(h * 0.06, narrow ? -h * 0.3 : h * 0.22, aside))
      if (b.mode === 'scripted' && b.group.visible) {
        // Standing, it fills a share of the screen's height: its own length, or the balloon's.
        const tall = Math.max(CONDOM.length, c.top - c.bottom)
        const fit = Math.min((h * state.standHeight) / tall, (w * (narrow ? 0.9 : 0.5)) / Math.max(1, c.width * 2))
        standScale = shown ? lerp(standScale, fit, 1 - Math.exp(-6 * dt)) : fit
        shown = true
        // Out of the packet: from its middle up through the opening (packet millimetres),
        // folded flat while inside, its closed end springing up only once it is clear.
        const slide = smoothstep(0, 0.5, ring)
        v.set(0, lerp(0, 44, slide), 0)
        b.pose.flatten = 1 - smoothstep(0.5, 0.68, ring)
        anchor.position.set(state.x, state.y, 0)
        anchor.quaternion.copy(featured.group.quaternion)
        anchor.scale.setScalar(state.scale)
        anchor.updateMatrixWorld()
        anchor.localToWorld(v)
        fromPacket.copy(anchor.quaternion).multiply(intoPacket)
        // …then free: forward, past the packet dropping away, facing us, and standing up as it unrolls.
        const free = smoothstep(0.5, 1, ring)
        const ef = free * free * (3 - 2 * free)
        standing.copy(facing).slerp(upright, smoothstep(0.02, 0.45, state.unroll))
        // A pump stroke makes it wobble.
        const grew = c.litres - lastLitres
        lastLitres = c.litres
        if (!reduced && grew > 0.01) pumpWobbleV += Math.min(0.6, grew * 1.6)
        pumpWobbleV += (-40 * pumpWobble - 4 * pumpWobbleV) * dt
        pumpWobble += pumpWobbleV * dt
        wobble.setFromEuler(tilt.set(pumpWobble * 0.12, 0, Math.sin(t * 1.3) * 0.02 * (reduced ? 0 : 1) + pumpWobble * 0.08))
        b.pose.position.set(lerp(v.x, state.standX, ef), lerp(v.y, state.standY, ef), lerp(v.z, 0, ef) + Math.sin(Math.PI * ef) * 90)
        b.pose.quaternion.copy(fromPacket).slerp(standing, ef).multiply(wobble)
        b.pose.scale = lerp(state.scale, standScale, ef)
      }
      b.update(dt, t)
    }

    // --- The water test ------------------------------------------------------
    if (waterTest) {
      const e = smoothstep(0, 1, clamp(state.water))
      waterTest.group.visible = e > 0.001
      if (waterTest.group.visible) {
        const c = waterTest.condom
        const tall = c.top - c.bottom
        const s = (h * (w < 760 ? 0.4 : 0.62)) / tall
        // It is lowered in from above, by its rim.
        waterTest.group.position.set(state.waterX, state.waterY + (1 - e) * h, -40)
        waterTest.group.scale.setScalar(s)
        waterTest.update(dt, t, reduced)
      }
    }

    // --- The finale's balloons ----------------------------------------------
    if (rise) {
      rise.amount = state.rise
      rise.update(dt, t)
    }

    // --- Physics ---------------------------------------------------------------
    if (!reduced) {
      physics.step(dt, (sub) => {
        cloud.forces(sub)
        balloon?.forces(sub)
      })
    }
    cloud.draw()
    balloon?.draw()
  }, 50)

  return {
    layer,
    state,
    physics,
    get count() {
      return cloud.count
    },
    detail: tier,
    get balloon() {
      return balloon
    },
    get waterTest() {
      return waterTest
    },
    more() {
      building ??= (async () => {
        const done = stage.quality?.hold()
        try {
          balloon = createBalloon(stage, layer, physics, tier)
          scene.add(balloon.group)
          waterTest = createWater(tier)
          scene.add(waterTest.group)
          rise = createRise(stage, layer, tier)
          // Compiled while nobody looks: shown for the warm-up, hidden again.
          balloon.group.visible = waterTest.group.visible = true
          rise.amount = 1
          rise.update(0, 0)
          await layer.warmUp()
          balloon.group.visible = waterTest.group.visible = false
          rise.reset()
        } finally {
          done?.()
        }
      })()
      return building
    },
    collide(elements) {
      // The headlines sit in sticky pins: measured every frame (batched in the measure phase).
      stage.use(domColliders(physics, elements, { size: () => layer, depth: 700, group: 4, mask: 2, restitution: 0.65, live: true }))
    },
    inZones() {
      return cloud.inZones(state.clear)
    },
    waterOnScreen() {
      if (!waterTest?.group.visible) return null
      const g = waterTest.group
      const c = waterTest.condom
      // The drop hangs below the rim: its middle about two thirds of the way down.
      const s = g.scale.x
      const camZ = layer.distance
      const k = camZ / Math.max(1, camZ - g.position.z)
      const tall = (c.top - c.bottom) * s
      return { x: layer.width / 2 + g.position.x * k, y: layer.height / 2 - (g.position.y - tall * 0.72) * k, r: c.width * s * k }
    },
    onKnock(fn) {
      cloud.onKnock(fn)
    },
    onBump(fn) {
      bump = fn
    },
    dispose() {
      cloud.dispose()
      featured.dispose()
      balloon?.dispose()
      waterTest?.dispose()
      rise?.dispose()
      parts.dispose()
    },
  }
}
