/**
 * Durex Invisible — «Zero gravity.» The film so far: a loader that tears, a
 * question (sound or not), a baby crying — «Annoying, isn't it?» — packets
 * floating weightless, and «Zero gravity. Zero worries.» with one packet
 * turning to show both faces. The chapters to come (rip, roll, pump, let go)
 * are planned in README.md.
 */
import './style.css'
import { clamp, createStage, Preloader, range, scenePresets, smoothstep, splitText, supportsWebGL2 } from '@veyra/core'
import type { World, Zone } from './gl/world'
import { PACKET_FONTS } from './gl/foil'
import { initLoader } from './loader'
import { createSound } from './sound'

const html = document.documentElement
// The film starts at the top.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
const params = new URLSearchParams(location.search)
const capture = import.meta.env.DEV || params.has('capture')
// Captures and checks can pin a tier: `?capture&quality=low|medium|high`.
const pinned = capture ? { low: 0.15, medium: 0.5, high: 0.85 }[params.get('quality') ?? ''] : undefined
// Sound stays off until the visitor says so at the gate.
const stage = createStage({
  sound: { storageKey: 'durex:sound:on' },
  quality: { dprRange: [1, 2], ...(pinned === undefined ? {} : { initial: pinned, adaptive: false }) },
})
const sound = createSound(stage.sound)
const reduced = stage.reducedMotion.value
html.classList.toggle('reduced', reduced)
stage.reducedMotion.subscribe((r) => html.classList.toggle('reduced', r))
stage.quality?.tier.subscribe((t) => (html.dataset.quality = t), { immediate: true })
const wait = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000))
const debug: Record<string, unknown> = {}
if (capture) Object.assign(window, { __durex: debug })

// ---------------------------------------------------------------------
// Sound: the HUD toggle.
// ---------------------------------------------------------------------
const toggle = document.querySelector<HTMLButtonElement>('.sound-toggle')!
stage.sound?.enabled.subscribe(
  (on) => {
    toggle.setAttribute('aria-pressed', String(on))
    toggle.setAttribute('aria-label', on ? 'Sound is on; turn it off' : 'Sound is off; turn it on')
    toggle.querySelector('.sound-label')!.textContent = on ? 'Sound on' : 'Sound'
  },
  { immediate: true },
)
toggle.addEventListener('click', () => void stage.sound?.toggle())
// The bars move only while sound actually plays.
stage.onFrame(() => html.classList.toggle('sound-live', stage.sound?.audible === true))

// ---------------------------------------------------------------------
// Loading: fonts (the packet's artwork is set in them), then the world.
// ---------------------------------------------------------------------
const loader = initLoader()
const preload = new Preloader()
preload.progress.subscribe((p) => loader.progress(p), { immediate: true })
const fonts = Promise.all([
  preload.font('400 1em "Instrument Serif"', 'Annoying, isn’t it?', 1),
  preload.font('italic 400 1em "Instrument Serif"', 'isn’t it? Zero worries.', 0.5),
  ...PACKET_FONTS.map((font) => preload.font(font, 'durex INVISIBLE', 0.5)),
])
let world: World | null = null
if (supportsWebGL2()) {
  preload
    .add(
      (async () => {
        await fonts
        const { createWorld } = await import('./gl/world')
        const w = createWorld(stage)
        // Compiled and drawn once before it shows.
        await w.layer.warmUp()
        world = w
        debug.world = w
      })(),
      4,
    )
    .catch((error: unknown) => {
      console.warn('[durex] WebGL unavailable, using the drawn packet.', error)
      html.classList.add('no-webgl')
    })
} else {
  html.classList.add('no-webgl')
}

stage.scroll?.lock()
window.scrollTo(0, 0)
const loaded = preload.done({ minDuration: reduced ? 0 : 1.2 })
// Loading is slow on purpose: the quality governor waits.
stage.quality?.hold(loaded)
await loaded
await loader.finish(stage, () => sound.rip())
html.classList.add('is-ready')
debug.stage = stage

// ---------------------------------------------------------------------
// The gate: with sound, or without.
// ---------------------------------------------------------------------
const choice = await new Promise<'sound' | 'silent'>((resolve) => {
  const gate = document.querySelector<HTMLElement>('.gate')!
  gate.hidden = false
  gate.querySelector<HTMLButtonElement>('[data-gate="sound"]')!.focus()
  for (const button of gate.querySelectorAll<HTMLButtonElement>('[data-gate]')) {
    button.addEventListener(
      'click',
      async () => {
        const picked = button.dataset.gate as 'sound' | 'silent'
        // Asked for out loud: it plays even on an iPhone set to silent.
        if (picked === 'sound') await stage.sound?.enable()
        else stage.sound?.disable()
        gate.classList.add('is-leaving')
        window.setTimeout(() => (gate.hidden = true), reduced ? 0 : 450)
        resolve(picked)
      },
      { once: true },
    )
  }
})

// ---------------------------------------------------------------------
// The opening: a baby cries. Then the punchline.
// ---------------------------------------------------------------------
html.classList.add('is-crying')
const cried = choice === 'sound' ? sound.cry() : 0
debug.cried = cried > 0
await wait(reduced ? 1.2 : Math.max(cried, 2.6))
html.classList.remove('is-crying')
// A beat of silence.
await wait(reduced ? 0 : 0.6)
html.classList.add('is-open')
if (!reduced) {
  const chars = splitText('.hero-title', { type: 'chars' }).chars
  stage.timeline().fromTo(chars, { opacity: 0, y: '0.35em' }, { opacity: 1, y: '0em' }, { duration: 0.9, ease: 'expoOut', stagger: 0.03 }).play()
}
// The packets float in.
if (world) stage.animate((world as World).state, { cloud: 1 }, { duration: 2.6, ease: 'glide' })
stage.scroll?.unlock()
stage.refresh(true)

// ---------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------
const heroCopy = document.querySelectorAll<HTMLElement>('.hero-title, .hero-sub, .hero-scroll')
const heroTitle = document.querySelector<HTMLElement>('.hero-title')!
const heroSub = document.querySelector<HTMLElement>('.hero-sub')!
const zero = document.querySelector<HTMLElement>('#zero')!
const zeroCopy = zero.querySelector<HTMLElement>('.zero-copy')!

// The words come first: packets keep out of the copy on screen. Measured at
// rest (layout boxes, without the scroll's transforms) when the layout
// changes, never per frame; each zone is as strong as its copy is present.
const heroZone: Zone = { left: 0, top: 0, right: 0, bottom: 0, amount: 1 }
const zeroZone: Zone = { left: 0, top: 0, right: 0, bottom: 0, amount: 0 }
let zeroIn = 0
let zeroProgress = 0
const zeroPresent = () => (zeroZone.amount = Math.min(zeroIn, 1 - smoothstep(0.92, 1, zeroProgress)))
function measureZones() {
  const room = 12
  // The headline and its line, where the page opens (their offset parent is the hero).
  const top = (heroTitle.offsetParent as HTMLElement | null)?.offsetTop ?? 0
  heroZone.left = Math.min(heroTitle.offsetLeft, heroSub.offsetLeft) - room
  heroZone.right = Math.max(heroTitle.offsetLeft + heroTitle.offsetWidth, heroSub.offsetLeft + heroSub.offsetWidth) + room
  heroZone.top = top + heroTitle.offsetTop - room
  heroZone.bottom = top + heroSub.offsetTop + heroSub.offsetHeight + room
  // The chapter's copy, where its pin holds it: at the top of the screen.
  zeroZone.left = zeroCopy.offsetLeft - room
  zeroZone.right = zeroCopy.offsetLeft + zeroCopy.offsetWidth + room
  zeroZone.top = zeroCopy.offsetTop - room
  zeroZone.bottom = zeroCopy.offsetTop + zeroCopy.offsetHeight + room
}
if (world) {
  const w = world as World
  w.state.clear = [heroZone, zeroZone]
  measureZones()
  stage.onRefresh(measureZones)
}

stage.scene('#top', {
  start: 'top top',
  end: 'bottom top',
  onProgress(p) {
    heroZone.amount = 1 - range(p, 0, 0.6)
    for (const el of heroCopy) {
      el.style.opacity = String(1 - range(p, 0, 0.6))
      if (!reduced) el.style.translate = `0 ${-p * 12}vh`
    }
  },
})
stage.scene(zero, {
  start: 'top bottom',
  end: 'top top',
  onEnter: () => sound.crinkle(0.8),
  onProgress(p) {
    zeroIn = p
    zeroPresent()
  },
  cssVar: '--in',
})
stage.scene(zero, {
  ...scenePresets.pinned,
  cssVar: '--p',
  // (Progress, not per-frame updates: a jump past the chapter still lands at its end.)
  onProgress(p) {
    zeroProgress = p
    zeroPresent()
    if (!world) return
    const s = world.state
    const w = world.layer.width
    const h = world.layer.height
    const narrow = w < 760
    // One packet comes forward, shows its face, then turns over; the others drift off.
    s.feature = smoothstep(0, 0.32, p) * (1 - smoothstep(0.92, 1, p))
    s.cloud = 1 - 0.7 * smoothstep(0, 0.4, p)
    s.turn = reduced ? 0 : -0.3 + smoothstep(0.42, 0.78, p) * Math.PI + 0.12 * Math.sin(p * 6)
    s.x = narrow ? 0 : w * 0.2
    s.y = narrow ? -h * 0.18 : 0
    s.scale = (narrow ? Math.min(w * 0.68, h * 0.42) : Math.min(w * 0.36, h * 0.62)) / 54
  },
})
// After the chapter the cloud stays thin.
stage.scene('#next', { start: 'top bottom', end: 'bottom top', onProgress: (p) => world && (world.state.cloud = clamp(0.3 - 0.3 * p)) })
