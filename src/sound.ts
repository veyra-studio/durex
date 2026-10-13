/**
 * The film's sounds: natural recordings, all CC0 from Freesound (credited in
 * the footer), cut, levelled and compressed into src/sounds — and carried as
 * data inside scripts loaded on demand, never fetched as audio files, which
 * download managers (IDM and the like) would grab one after another. Nothing
 * plays while sound is off.
 *
 * Short sounds are grains of a longer take, picked at random — no two
 * crinkles alike. The pump, the escaping air and the music are loops that
 * cross-fade into themselves; the air's pitch follows the pressure left, so
 * the squeal drops as the balloon empties, and the music turns over on its bar.
 */
import type { SoundBus, Voice } from '@veyra/core'

export type SoundName = 'cry' | 'rip' | 'crinkle' | 'pump' | 'squeal' | 'hiss' | 'latex' | 'water' | 'music'

/** Where the squeaks are in latex.mp3, and the sloshes in water.mp3 (seconds). */
const SQUEAKS = [0.38, 1.18, 1.85, 2.2, 2.9, 3.4, 3.85, 4.48]
const SLOSHES = [0.15, 1.35, 2.65, 3.85]
/** The music: 24 bars of about 130 bpm; the take runs a second longer, for the cross-fade. */
const MUSIC_LOOP = 24 * 1.8437

export interface DurexSound {
  /** Fetches these ahead (no audio needed yet). */
  prefetch(...names: SoundName[]): void
  /** Decodes what has been fetched; call once sound is on. */
  ready(...names: SoundName[]): Promise<void>
  /** The cry, cut short at `seconds` if asked; returns how long it lasts (0 when silent). */
  cry(seconds?: number): number
  /** The packet torn open. */
  rip(): void
  /** Foil handled. */
  crinkle(strength?: number): void
  /** Two packets knock: the tiniest crinkle (a few a second at most). `pan` −1…1. */
  tap(strength: number, pan?: number): void
  /** Latex rubbing, stretching, bumping. */
  squeak(strength?: number, pan?: number): void
  /** The pump, while held. */
  pump(on: boolean): void
  /** The air escaping: pressure left and flow, 0…1; a flow of 0 stops it. */
  air(pressure: number, flow: number): void
  /** Water moving in the drop. */
  slosh(strength?: number): void
  /** The music, low behind everything (fades in and out). */
  music(on: boolean): void
  /** Whether the music is playing now (for checks). */
  readonly musicPlaying: boolean
  /** Keeps the loops going; call every frame. */
  update(): void
  /** Stops whatever is running. */
  hush(): void
}

/** A take played round and round, each pass fading into the next. */
class Loop {
  private voice: Voice | null = null
  /** Where in the buffer the current pass is (seconds), by the clock and the rate. */
  private at = 0
  private last = 0
  private volume = 0
  private rate = 1
  constructor(
    private readonly bus: SoundBus,
    private readonly buffer: () => AudioBuffer | null,
    private readonly options: { fade: number; turnAt?: number; firstFade?: number },
  ) {}
  get playing(): boolean {
    return this.voice !== null
  }
  set(volume: number, rate: number): void {
    this.volume = volume
    this.rate = rate
    if (!this.voice) this.start(this.options.firstFade ?? 0.12)
    else {
      this.voice.setVolume(volume, 0.08)
      this.voice.setRate(rate, 0.08)
    }
  }
  stop(fade = 0.15): void {
    this.voice?.stop(fade)
    this.voice = null
  }
  update(): void {
    const ctx = this.bus.context
    const buffer = this.buffer()
    if (!this.voice || !ctx || !buffer) return
    const now = ctx.currentTime
    this.at += (now - this.last) * this.rate
    this.last = now
    // Where the next pass begins: on the bar for music, near the end of the take otherwise.
    const { fade, turnAt } = this.options
    if (this.at > (turnAt ?? buffer.duration - fade - 0.05)) {
      this.voice.stop(fade)
      this.voice = null
      this.start(turnAt === undefined ? fade : 0.02)
    }
  }
  private start(fadeIn: number): void {
    const buffer = this.buffer()
    const ctx = this.bus.context
    if (!buffer || !ctx) return
    this.voice = this.bus.voice(buffer, { volume: this.volume, rate: this.rate, fadeIn })
    this.at = 0
    this.last = ctx.currentTime
  }
}

export function createSound(bus: SoundBus | null): DurexSound {
  const bytes = new Map<SoundName, Promise<ArrayBuffer | null>>()
  const buffers = new Map<SoundName, AudioBuffer>()
  const decoding = new Map<SoundName, Promise<void>>()
  const get = (name: SoundName) => buffers.get(name) ?? null
  /** The data of a take: from its script (the music has its own), read through a data: URL. */
  const fetchBytes = (name: SoundName) => {
    let p = bytes.get(name)
    if (!p) {
      p = (name === 'music' ? import('./sounds/music').then((m) => m.music) : import('./sounds/effects').then((m) => m[name]))
        .then((url) => fetch(url))
        .then((r) => r.arrayBuffer())
        .catch(() => null)
      bytes.set(name, p)
    }
    return p
  }
  const decode = (name: SoundName) => {
    let p = decoding.get(name)
    if (!p) {
      p = (async () => {
        const ctx = bus?.context
        const data = await fetchBytes(name)
        if (!ctx || !data) return
        try {
          buffers.set(name, await ctx.decodeAudioData(data.slice(0)))
        } catch {
          // A browser that can't decode it simply stays quiet here.
        }
      })()
      decoding.set(name, p)
    }
    return p
  }
  /** A stretch of a take, faded at both ends so it never clicks. */
  const grain = (name: SoundName, offset: number, duration: number, volume: number, rate = 1, pan?: number) => {
    const buffer = get(name)
    if (!bus?.audible || !buffer) return
    const length = Math.min(duration, buffer.duration - offset)
    if (length <= 0.01) return
    bus.play(buffer, { offset, duration: length, volume, rate, pan, fadeIn: Math.min(0.012, length / 4), fadeOut: Math.min(0.06, length / 3) })
  }
  const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!

  const pumping = bus ? new Loop(bus, () => get('pump'), { fade: 0.3 }) : null
  const squeal = bus ? new Loop(bus, () => get('squeal'), { fade: 0.2 }) : null
  const hiss = bus ? new Loop(bus, () => get('hiss'), { fade: 0.3 }) : null
  const tune = bus ? new Loop(bus, () => get('music'), { fade: 1, turnAt: MUSIC_LOOP, firstFade: 2.5 }) : null
  let lastTap = 0
  let musicOn = false

  return {
    prefetch(...names) {
      for (const n of names) void fetchBytes(n)
    },
    async ready(...names) {
      await Promise.all(names.map(decode))
    },
    cry(seconds) {
      const buffer = get('cry')
      if (!bus?.audible || !buffer) return 0
      const length = Math.min(buffer.duration, seconds ?? buffer.duration)
      bus.play(buffer, { volume: 0.85, duration: length, fadeOut: length < buffer.duration ? 0.45 : 0.2 })
      return length
    },
    rip() {
      const buffer = get('rip')
      if (!bus?.audible || !buffer) return
      bus.play(buffer, { volume: 0.9, rate: 0.95 + Math.random() * 0.1 })
    },
    crinkle(strength = 1) {
      grain('crinkle', Math.random() * 2.1, 0.18 + Math.random() * 0.2, 0.55 * strength, 0.92 + Math.random() * 0.2)
    },
    tap(strength, pan) {
      const now = performance.now()
      if (now - lastTap < 70 || strength < 0.05) return
      lastTap = now
      grain('crinkle', Math.random() * 2.3, 0.06 + Math.random() * 0.05, 0.35 * Math.min(1, strength), 1.1 + Math.random() * 0.3, pan)
    },
    squeak(strength = 1, pan) {
      grain('latex', pick(SQUEAKS), 0.22 + Math.random() * 0.2, 0.6 * strength, 0.9 + Math.random() * 0.25, pan)
    },
    pump(on) {
      if (!bus?.audible || !pumping) return
      if (on) pumping.set(0.55, 1)
      else pumping.stop(0.2)
    },
    air(pressure, flow) {
      if (!bus?.audible || !squeal || !hiss) return
      if (flow <= 0.01) {
        squeal.stop(0.25)
        hiss.stop(0.4)
        return
      }
      // A full balloon screams high; the pitch drops with the pressure.
      squeal.set(0.75 * Math.sqrt(flow), 0.72 + 0.55 * Math.sqrt(pressure))
      hiss.set(0.3 * flow, 0.9 + 0.2 * pressure)
    },
    slosh(strength = 1) {
      grain('water', pick(SLOSHES), 0.7, 0.8 * strength, 0.92 + Math.random() * 0.16)
    },
    music(on) {
      musicOn = on
      if (!tune) return
      if (!on) tune.stop(1.2)
      else if (bus?.audible && get('music')) tune.set(0.3, 1)
    },
    get musicPlaying() {
      return tune?.playing === true
    },
    update() {
      pumping?.update()
      squeal?.update()
      hiss?.update()
      // The music starts as soon as it has been decoded, if it is wanted.
      if (musicOn && tune && !tune.playing && bus?.audible && get('music')) tune.set(0.3, 1)
      tune?.update()
    },
    hush() {
      pumping?.stop()
      squeal?.stop()
      hiss?.stop()
      tune?.stop(0.6)
    },
  }
}
