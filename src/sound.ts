/**
 * The film's sounds, all synthesized on the engine's sound bus — no
 * recordings. The baby's cry is a voice: a buzzing source (a sawtooth,
 * roughened) shaped by an infant's vowel formants, each "waaah" with its own
 * pitch contour, vibrato and a "w" that opens into the "a", gasps between
 * the bouts. Foil crinkles as clusters of tiny bright clicks; the tear is a
 * rising, grainy rip. Everything is a silent no-op while sound is off.
 */
import type { SoundBus } from '@veyra/core'

export interface DurexSound {
  /** The cry (three bouts and their gasps); returns how long it lasts, in seconds (0 when silent). */
  cry(): number
  /** Foil handled: a cluster of crinkles. */
  crinkle(strength?: number): void
  /** The packet torn open. */
  rip(): void
  /** A soft tick (chapter changes). */
  tick(): void
}

/** A soft clip for the voice's roughness. */
function roughCurve(amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount)
  }
  return curve
}

export function createSound(bus: SoundBus | null): DurexSound {
  /** One "waaah": `t0` from now, `dur` long, around `f0` Hz. */
  const bout = (ctx: AudioContext, out: AudioNode, t0: number, dur: number, f0: number) => {
    const voice = ctx.createOscillator()
    voice.type = 'sawtooth'
    const f = voice.frequency
    f.setValueAtTime(f0 * 0.82, t0)
    f.linearRampToValueAtTime(f0 * 1.12, t0 + dur * 0.22)
    f.linearRampToValueAtTime(f0 * 1.04, t0 + dur * 0.7)
    f.exponentialRampToValueAtTime(f0 * 0.68, t0 + dur)
    // A sobbing vibrato, a little uneven.
    const wobble = ctx.createOscillator()
    wobble.frequency.value = 6.2 + Math.random() * 1.4
    const depth = ctx.createGain()
    depth.gain.value = f0 * 0.04
    wobble.connect(depth).connect(f)
    const rough = ctx.createWaveShaper()
    rough.curve = roughCurve(2.2)
    // The mouth: an infant's /a/, opening from a "w".
    const mouth = ctx.createGain()
    mouth.gain.value = 1
    const formants: Array<[from: number, to: number, q: number, gain: number]> = [
      [600, 1150, 5, 1],
      [1000, 2450, 7, 0.7],
      [3400, 4300, 9, 0.32],
    ]
    voice.connect(rough)
    for (const [from, to, q, gain] of formants) {
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.Q.value = q
      band.frequency.setValueAtTime(from, t0)
      band.frequency.exponentialRampToValueAtTime(to, t0 + 0.14)
      band.frequency.exponentialRampToValueAtTime(to * 0.9, t0 + dur)
      const level = ctx.createGain()
      level.gain.value = gain
      rough.connect(band).connect(level).connect(mouth)
    }
    // The breath behind it: swell, hold, break off.
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t0)
    env.gain.exponentialRampToValueAtTime(0.32, t0 + 0.09)
    env.gain.linearRampToValueAtTime(0.27, t0 + dur * 0.75)
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    mouth.connect(env).connect(out)
    voice.start(t0)
    wobble.start(t0)
    voice.stop(t0 + dur + 0.05)
    wobble.stop(t0 + dur + 0.05)
  }

  return {
    cry() {
      const ctx = bus?.context
      const out = bus?.output
      if (!bus?.audible || !ctx || !out) return 0
      const now = ctx.currentTime + 0.05
      const bouts: Array<[start: number, dur: number, f0: number]> = [
        [0, 1.05, 470],
        [1.32, 1.35, 520],
        [2.95, 0.95, 495],
      ]
      for (const [start, dur, f0] of bouts) bout(ctx, out, now + start, dur, f0)
      // The gasps in between.
      for (const at of [1.1, 2.72]) bus.burst({ filter: 'bandpass', from: 1700, to: 3300, q: 2.2, gain: 0.07, attack: 0.03, decay: 0.16, delay: at + 0.05 })
      return 3.95
    },
    crinkle(strength = 1) {
      if (!bus?.audible) return
      const n = 5 + Math.round(Math.random() * 6)
      for (let i = 0; i < n; i++) {
        const f = 3000 + Math.random() * 5000
        bus.burst({ filter: 'highpass', from: f, to: f * 0.8, q: 0.9, gain: (0.03 + Math.random() * 0.05) * strength, attack: 0.001, decay: 0.012 + Math.random() * 0.03, delay: Math.random() * 0.28 })
      }
    },
    rip() {
      if (!bus?.audible) return
      // A rising tear, in grains.
      for (let i = 0; i < 9; i++) {
        const t = i * 0.035
        bus.burst({ filter: 'bandpass', from: 1300 + i * 260, to: 1700 + i * 300, q: 1.4, gain: 0.07 + Math.random() * 0.05, attack: 0.002, decay: 0.05, delay: t })
      }
      bus.burst({ filter: 'highpass', from: 5200, to: 3000, gain: 0.05, attack: 0.004, decay: 0.3, delay: 0.02 })
    },
    tick() {
      bus?.tone({ frequency: 2400, to: 1800, type: 'triangle', gain: 0.035, decay: 0.06 })
    },
  }
}
