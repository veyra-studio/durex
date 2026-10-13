/**
 * Natural rubber latex, thin and lubricated. Nearly clear where you look
 * through it straight on, milky where you look along it (more latex in the
 * line of sight), a pale cream cast, a wet clearcoat and a faint oily
 * rainbow. Light reflected off the film adds to whatever lies behind it
 * (premultiplied alpha), so highlights stay bright on clear latex.
 * Stretched latex is thinner, so clearer and paler: geometry may carry an
 * `aStretch` attribute (area stretch, 1 = relaxed). Drawn in two passes,
 * the inside then the outside, so the far wall shows through the near one.
 */
import * as THREE from 'three'
import { colors } from '../palette'
import type { Tier } from './foil'

export interface Latex {
  /** The inside of the film (drawn first). */
  inner: THREE.MeshPhysicalMaterial
  /** The outside of the film. */
  outer: THREE.MeshPhysicalMaterial
  dispose(): void
}

export interface LatexOptions {
  /**
   * How many films the eye looks through: 1 for the sheath, many for a
   * rolled rim (they compose: 1 − (1 − a)ⁿ). Default 1.
   */
  layers?: number
  /** A roll of film is satin, not a wet mirror: rougher, less coat. Default false. */
  satin?: boolean
  /**
   * Fine creases in relaxed film (mm of relief): they smooth out as it
   * stretches, so a blown-up balloon is glossy and a loose sheath isn't
   * glass. Default 0.
   */
  wrinkles?: number
}

export function createLatex(tier: Tier, options: LatexOptions = {}): Latex {
  const uLayers = { value: options.layers ?? 1 }
  const uWrinkles = { value: tier === 'low' ? 0 : (options.wrinkles ?? 0) }
  const satin = options.satin ?? false
  const make = (side: THREE.Side) => {
    const material = new THREE.MeshPhysicalMaterial({
      color: colors.latex,
      // Light scattered inside the rubber: latex is hazy, never black-clear.
      emissive: new THREE.Color('#3a3732'),
      roughness: satin ? 0.46 : 0.24,
      metalness: 0,
      ior: 1.52,
      specularIntensity: satin ? 0.6 : 1,
      // The lubricant: a wet coat over the rubber.
      clearcoat: satin ? 0.25 : 0.85,
      clearcoatRoughness: satin ? 0.3 : 0.07,
      sheen: satin ? 0.6 : 0.25,
      sheenRoughness: 0.45,
      sheenColor: new THREE.Color('#fff6e6'),
      iridescence: tier === 'low' || satin ? 0 : 0.16,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [180, 420],
      envMapIntensity: satin ? 0.8 : 1.1,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      side,
    })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uLayers = uLayers
      shader.uniforms.uWrinkles = uWrinkles
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aStretch;\nvarying float vStretch;\nvarying vec3 vFilm;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStretch = max(aStretch, 1.0);\nvFilm = position;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          uniform float uLayers;
          uniform float uWrinkles;
          varying float vStretch;
          varying vec3 vFilm;
          // Creases in relaxed film, in its own millimetres: long soft folds
          // along the length and finer ones across them.
          // (Whole multiples of the angle only: no seam where it wraps.)
          float crease(vec3 p) {
            float a = atan(p.z, p.x);
            return sin(a * 7.0 + p.y * 0.06 + sin(p.y * 0.04) * 2.0) * 0.6
              + sin(a * 13.0 - p.y * 0.17 + sin(a * 3.0) * 1.2) * 0.3
              + sin(p.y * 0.35 + a * 2.0) * 0.1;
          }
          // Bumps a normal by the crease field's screen-space slope. Stretched
          // film is smooth; creases finer than a pixel fade instead of sparkling.
          vec3 wrinkled(vec3 n, float face) {
            float footprint = length(fwidth(vFilm));
            // (Not near the axis, where the angle the creases follow spins too fast.)
            float h = crease(vFilm) * uWrinkles / (vStretch * vStretch) * smoothstep(0.5, 0.12, footprint) * smoothstep(1.5, 5.0, length(vFilm.xz));
            vec3 sx = dFdx(-vViewPosition);
            vec3 sy = dFdy(-vViewPosition);
            vec3 r1 = cross(sy, n);
            vec3 r2 = cross(n, sx);
            float det = dot(sx, r1) * face;
            vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
            return normalize(abs(det) * n - grad);
          }`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          /* glsl */ `#include <normal_fragment_maps>
          if (uWrinkles > 0.0) normal = wrinkled(normal, faceDirection);`,
        )
        // The lubricant is thin: its gloss follows the creases too.
        .replace(
          '#include <clearcoat_normal_fragment_maps>',
          /* glsl */ `#include <clearcoat_normal_fragment_maps>
          if (uWrinkles > 0.0) clearcoatNormal = wrinkled(clearcoatNormal, faceDirection);`,
        )
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `#include <opaque_fragment>
          // How much latex the eye looks through: little head-on, much at a glancing angle.
          float facing = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
          float glancing = pow(1.0 - facing, 2.4);
          float thin = 1.0 / vStretch;
          float one = clamp(mix(0.12, 0.85, glancing) * mix(0.6, 1.0, thin) + 0.03, 0.0, 0.97);
          // Films stacked over each other (a roll): each lets through what the last let through.
          float film = clamp(1.0 - pow(1.0 - one, uLayers), 0.0, 0.97);
          // Light the film scatters (lit, and glowing from within) is as strong as
          // there is film; light it reflects adds up.
          vec3 scattered = totalDiffuse + totalEmissiveRadiance;
          gl_FragColor = vec4(scattered * film + max(outgoingLight - scattered, vec3(0.0)), film);`,
        )
        // Already premultiplied above: three.js would multiply by alpha again.
        .replace('#include <premultiplied_alpha_fragment>', '')
    }
    material.customProgramCacheKey = () => `durex-latex-${tier}-${satin ? 'satin' : 'wet'}`
    return material
  }
  const inner = make(THREE.BackSide)
  const outer = make(THREE.FrontSide)
  return {
    inner,
    outer,
    dispose() {
      inner.dispose()
      outer.dispose()
    },
  }
}
