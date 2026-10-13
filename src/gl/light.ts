/**
 * The studio both materials are lit by, baked into an environment: two tall
 * strips behind for the latex's bright edges, a broad box overhead for the
 * foil's sheen, a soft panel behind (so a packet's back reads as silver when
 * it turns), a narrow front strip that runs a streak across brushed foil, a
 * crimson bounce low on the right (the brand's accent, caught in every
 * curve) and a faint blue floor. Navy walls fading to black.
 */
import * as THREE from 'three'
import { studioEnvironment } from '@veyra/core/three'
import { colors } from '../palette'

export function durexStudio(renderer: THREE.WebGLRenderer): THREE.Texture {
  return studioEnvironment(renderer, {
    lights: [
      { size: [0.8, 9], position: [-4.6, 0.5, -2.2], intensity: 8 },
      { size: [0.8, 9], position: [4.6, 0.5, -2.2], intensity: 8 },
      { size: [6, 4], position: [0, 6.4, 1.8], intensity: 2.4, color: '#f3f5ff' },
      // Behind the subject: the far side of anything turning still finds light.
      { size: [5, 3.2], position: [0, 2.6, -5.6], intensity: 1.5, color: '#eef1ff' },
      { size: [1.1, 6.5], position: [-3.4, 1.2, 4.6], intensity: 4.2 },
      { size: [1.6, 1.6], position: [4.8, -1.4, 3.6], intensity: 0.45, color: colors.crimson },
      { size: [10, 10], position: [0, -5, 0], intensity: 0.15, color: '#7d8fd6' },
    ],
    walls: ['#0d1440', '#03040a'],
    blur: 0.015,
  })
}
