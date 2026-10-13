/**
 * The featured packet — the one that comes forward, turns over and is torn
 * open. The tear runs along a jagged line under the top seal, from the
 * notch on the right to the left: behind it the strip peels away from the
 * packet, hinged where the tear has got to, and once it is through, the
 * strip comes off and tumbles away. Both are the same faces as the cloud's,
 * clipped in the shader (packet coordinates, millimetres), so nothing about
 * the foil changes. Everything is scrubbed — scroll back and it heals.
 */
import * as THREE from 'three'
import { clamp, smoothstep } from '@veyra/core'
import type { PacketParts } from './foil'

/** Where the tear runs, under the top seal (mm, packet coordinates). */
export const TEAR_LINE = 21.2

export interface Featured {
  /** Placed and scaled (px per mm) by the world. */
  readonly group: THREE.Group
  /** 0…1: torn from the notch on the right edge across to the left. */
  tear: number
  /** 0…1: the strip, off, tumbles away. */
  fly: number
  update(): void
  dispose(): void
}

function tearable(base: THREE.MeshPhysicalMaterial, strip: boolean, uniforms: { uTearX: { value: number }; uTearAngle: { value: number } }): THREE.MeshPhysicalMaterial {
  const m = base.clone()
  if (strip) m.defines = { ...m.defines, TEAR_STRIP: '' }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTearX = uniforms.uTearX
    shader.uniforms.uTearAngle = uniforms.uTearAngle
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTearX;\nuniform float uTearAngle;\nvarying vec2 vPacket;')
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        #ifdef TEAR_STRIP
          if (position.x > uTearX) {
            float tc = cos(uTearAngle);
            float ts = sin(uTearAngle);
            objectNormal = vec3(objectNormal.x * tc - objectNormal.z * ts, objectNormal.y, objectNormal.x * ts + objectNormal.z * tc);
          }
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPacket = position.xy;
        #ifdef TEAR_STRIP
          // Peeled toward the viewer about a hinge at the tear's front.
          if (position.x > uTearX) {
            float tc = cos(uTearAngle);
            float ts = sin(uTearAngle);
            float dx = transformed.x - uTearX;
            transformed.x = uTearX + dx * tc - transformed.z * ts;
            transformed.z = dx * ts + transformed.z * tc;
          }
        #endif`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTearX;\nvarying vec2 vPacket;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        // Torn foil is never straight.
        float tearLine = ${TEAR_LINE.toFixed(1)} + 0.35 * sin(vPacket.x * 1.9) + 0.25 * sin(vPacket.x * 4.7 + 1.0) + 0.12 * sin(vPacket.x * 11.3);
        bool inStrip = vPacket.y > tearLine && vPacket.x > uTearX;
        #ifdef TEAR_STRIP
          if (!inStrip) discard;
        #else
          if (inStrip) discard;
        #endif`,
      )
  }
  m.customProgramCacheKey = () => `durex-tear-${strip ? 'strip' : 'body'}-${base.uuid}`
  return m
}

export function createFeatured(parts: PacketParts): Featured {
  const uniforms = { uTearX: { value: 40 }, uTearAngle: { value: 0 } }
  const materials = [
    tearable(parts.frontMaterial, false, uniforms),
    tearable(parts.backMaterial, false, uniforms),
    tearable(parts.frontMaterial, true, uniforms),
    tearable(parts.backMaterial, true, uniforms),
  ]
  const group = new THREE.Group()
  group.add(new THREE.Mesh(parts.front, materials[0]), new THREE.Mesh(parts.back, materials[1]))
  // The strip: its own group, so once it is off it can tumble away on its own.
  const strip = new THREE.Group()
  const stripMeshes = [new THREE.Mesh(parts.front, materials[2]), new THREE.Mesh(parts.back, materials[3])]
  // It tumbles about its own middle, along the top.
  const PIVOT = 24.5
  for (const m of stripMeshes) m.position.y = -PIVOT
  strip.add(...stripMeshes)
  group.add(strip)
  const spin = new THREE.Quaternion()
  const axis = new THREE.Vector3(0.35, 1, 0.55).normalize()

  const self: Featured = {
    group,
    tear: 0,
    fly: 0,
    update() {
      const tear = clamp(self.tear)
      // From just past the right edge to just past the left.
      uniforms.uTearX.value = 28 - 56 * tear
      // The torn part peels further back as the tear goes on.
      uniforms.uTearAngle.value = 1.9 * smoothstep(0, 0.6, tear)
      for (const m of stripMeshes) m.visible = tear > 0.001
      // Off: away up and to the left, toward the viewer, tumbling, gone.
      const f = clamp(self.fly)
      const e = f * f
      strip.position.set(-46 * e, PIVOT + 70 * e + 14 * f, 120 * e)
      strip.quaternion.copy(spin.setFromAxisAngle(axis, 7 * e))
      strip.scale.setScalar(1 - smoothstep(0.7, 1, f))
      strip.visible = f < 0.999
    },
    dispose() {
      for (const m of materials) m.dispose()
    },
  }
  self.update()
  return self
}
