/**
 * Durex Invisible — «Zero gravity.» The film: a loader that tears, a question
 * (sound or not), a baby crying — «Annoying, isn't it?» — and packets
 * floating weightless; 00, one packet comes forward and turns over; 01, it is
 * torn open and the ring slides out; 02, it unrolls; 03, you blow it up;
 * 04, you let it go (it rockets round the page) or tie it (it stays); 05, the
 * water test; 06, play safe.
 *
 * The chapters' scroll scenes only note how far along they are; `direct()`
 * turns those into the world's state once a frame, with one owner for every
 * value — so scrolling back, or jumping, always lands right.
 */
import './style.css'
import { clamp, createStage, holdable, lerp, Preloader, range, scenePresets, smoothstep, splitText, supportsWebGL2 } from '@veyra/core'
import type { World, Zone } from './gl/world'
import { PACKET_FONTS } from './gl/foil'
import { initLoader } from './loader'
import { createSound, type SoundName } from './sound'

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
debug.sound = sound

// ---------------------------------------------------------------------
// Sound: the HUD toggle, and the recordings, fetched ahead and decoded
// once sound is on.
// ---------------------------------------------------------------------
const ALL: SoundName[] = ['cry', 'rip', 'crinkle', 'pump', 'squeal', 'hiss', 'latex', 'water', 'music']
const toggle = document.querySelector<HTMLButtonElement>('.sound-toggle')!
stage.sound?.enabled.subscribe(
  (on) => {
    toggle.setAttribute('aria-pressed', String(on))
    toggle.setAttribute('aria-label', on ? 'Sound is on; turn it off' : 'Sound is off; turn it on')
    toggle.querySelector('.sound-label')!.textContent = on ? 'Sound on' : 'Sound'
    if (on) {
      sound.prefetch(...ALL)
      void sound.ready(...ALL)
    } else sound.hush()
  },
  { immediate: true },
)
toggle.addEventListener('click', () => void stage.sound?.toggle())
// The bars move only while sound actually plays.
stage.onFrame(() => html.classList.toggle('sound-live', stage.sound?.audible === true))

/** The word for a sound, popping up beside what makes it. */
const say = (name: string) => {
  const el = document.querySelector<HTMLElement>(`[data-caption="${name}"]`)
  if (!el) return
  el.classList.remove('is-on')
  // (Restarts the animation: a layout read, once, on an event.)
  void el.offsetWidth
  el.classList.add('is-on')
  window.setTimeout(() => el.classList.remove('is-on'), 1500)
}

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
// The recordings' script comes in while the question is read (as data — no audio request,
// and not competing with the loading), so the cry can start the moment it is asked for.
sound.prefetch('cry')
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
        if (picked === 'sound') {
          await stage.sound?.enable()
          await sound.ready('cry')
        } else stage.sound?.disable()
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
// Long enough to be annoying; cut before it outstays the joke.
const cried = choice === 'sound' ? sound.cry(2.7) : 0
debug.cried = cried > 0
await wait(reduced ? 1.2 : cried > 0 ? cried - 0.25 : 2.2)
html.classList.remove('is-crying')
// Hardly a beat of silence: the line lands while the cry dies away.
await wait(reduced ? 0 : 0.15)
html.classList.add('is-open')
if (!reduced) {
  const chars = splitText('.hero-title', { type: 'chars' }).chars
  stage.timeline().fromTo(chars, { opacity: 0, y: '0.35em' }, { opacity: 1, y: '0em' }, { duration: 0.9, ease: 'expoOut', stagger: 0.03 }).play()
}
stage.scroll?.unlock()
stage.refresh(true)
// Then the music…
window.setTimeout(() => sound.music(true), 400)
// …and the packets sweep in from the sides, all at once.
const opening = { amount: 0 }
window.setTimeout(
  () => {
    stage.animate(opening, { amount: 1 }, { duration: reduced ? 0 : 1.1, ease: 'expoOut' })
    sound.crinkle(1)
  },
  reduced ? 0 : 1000,
)
// The condom's chapters are built while the opening plays.
if (world) void (world as World).more().then(() => (debug.more = true))

// ---------------------------------------------------------------------
// Chapters: each scene notes how far along it is.
// ---------------------------------------------------------------------
const P = { top: 0, zeroIn: 0, zero: 0, ripIn: 0, rip: 0, rollIn: 0, roll: 0, pumpIn: 0, pump: 0, letgoIn: 0, letgo: 0, testedIn: 0, tested: 0, play: 0 }
debug.progress = P
const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const heroCopy = document.querySelectorAll<HTMLElement>('.hero-title, .hero-sub, .hero-scroll')
const chapter = (id: 'zero' | 'rip' | 'roll' | 'pump' | 'letgo' | 'tested') => {
  const el = $(`#${id}`)
  const into = `${id}In` as keyof typeof P
  stage.scene(el, { start: 'top bottom', end: 'top top', cssVar: '--in', onProgress: (p) => (P[into] = p) })
  // (Progress, not per-frame updates: a jump past the chapter still lands at its end.)
  stage.scene(el, { ...scenePresets.pinned, cssVar: '--p', onProgress: (p) => (P[id] = p) })
  return el
}
stage.scene('#top', {
  start: 'top top',
  end: 'bottom top',
  onProgress(p) {
    P.top = p
    for (const el of heroCopy) {
      el.style.opacity = String(1 - range(p, 0, 0.6))
      if (!reduced) el.style.translate = `0 ${-p * 12}vh`
    }
  },
})
const zero = chapter('zero')
const rip = chapter('rip')
chapter('roll')
chapter('pump')
chapter('letgo')
chapter('tested')
stage.scene('#playsafe', { start: 'top bottom', end: 'bottom bottom', onProgress: (p) => (P.play = p) })
stage.scene(zero, { start: 'top 60%', end: 'top top', onEnter: () => sound.crinkle(0.8) })

// ---------------------------------------------------------------------
// The words come first: packets keep out of the copy on screen. Measured
// at rest (layout boxes, without the scroll's transforms) when the layout
// changes, never per frame; each zone is as strong as its copy is present.
// ---------------------------------------------------------------------
const heroTitle = $('.hero-title')
const heroSub = $('.hero-sub')
const zones = { hero: zone(), zero: zone(), rip: zone() }
function zone(): Zone {
  return { left: 0, top: 0, right: 0, bottom: 0, amount: 0 }
}
function measureZones() {
  const room = 12
  // The headline and its line, where the page opens (their offset parent is the hero).
  const top = (heroTitle.offsetParent as HTMLElement | null)?.offsetTop ?? 0
  const z = zones.hero
  z.left = Math.min(heroTitle.offsetLeft, heroSub.offsetLeft) - room
  z.right = Math.max(heroTitle.offsetLeft + heroTitle.offsetWidth, heroSub.offsetLeft + heroSub.offsetWidth) + room
  z.top = top + heroTitle.offsetTop - room
  z.bottom = top + heroSub.offsetTop + heroSub.offsetHeight + room
  // A chapter's copy, where its pin holds it: at the top of the screen.
  for (const [key, section] of [
    ['zero', zero],
    ['rip', rip],
  ] as const) {
    const copy = section.querySelector<HTMLElement>('.copy')!
    const c = zones[key]
    c.left = copy.offsetLeft - room
    c.right = copy.offsetLeft + copy.offsetWidth + room
    c.top = copy.offsetTop - room
    c.bottom = copy.offsetTop + copy.offsetHeight + room
  }
}
if (world) {
  ;(world as World).state.clear = [zones.hero, zones.zero, zones.rip]
  measureZones()
  stage.onRefresh(measureZones)
}

// ---------------------------------------------------------------------
// 03 — Pump: hold to pump (or scroll); the gauge reads the shape.
// ---------------------------------------------------------------------
let pumped = 0
const gauge = $('.gauge-num')
const milestones = [...document.querySelectorAll<HTMLElement>('.milestone')]
let lastSqueak = 0
stage.use(
  holdable('[data-pump]', {
    onStart: () => {
      sound.pump(true)
      say('pump')
    },
    onHold: (_hold, dt) => {
      // Easy at first, harder as it fills — as soon as the chapter is on screen.
      if (P.pump > 0 || P.pumpIn > 0.5) pumped = Math.min(41, pumped + (1.2 + 9 * (1 - pumped / 44)) * dt)
    },
    onEnd: () => sound.pump(false),
  }),
)

// ---------------------------------------------------------------------
// 04 — Let go, or tie it.
// ---------------------------------------------------------------------
let chosen: 'go' | 'tie' | null = null
let deflate = 1
const status = $('.letgo-status')
const letgoButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-letgo]')]
const choose = (what: 'go' | 'tie', how: 'button' | 'auto' = 'button') => {
  const b = world?.balloon
  if (chosen || !b) return
  chosen = what
  for (const button of letgoButtons) button.disabled = true
  if (what === 'tie') {
    if (!reduced) b.tie()
    status.textContent = 'Tied. It’s yours for the rest of the film — bat it about.'
    sound.squeak(0.8)
    return
  }
  say('letgo')
  if (reduced) {
    // Without the flight: it empties where it is.
    deflate = 0.999
    status.textContent = 'Pfff… there it goes.'
    return
  }
  b.letGo()
  status.textContent = how === 'auto' ? 'It got away.' : 'Off it goes.'
}
for (const button of letgoButtons) button.addEventListener('click', () => choose(button.dataset.letgo as 'go' | 'tie'))
const unchoose = () => {
  if (!chosen) return
  chosen = null
  deflate = 1
  world?.balloon?.reset()
  sound.air(0, 0)
  for (const button of letgoButtons) button.disabled = false
  status.textContent = ''
}

// ---------------------------------------------------------------------
// 05 — Tested: poke the drop.
// ---------------------------------------------------------------------
const poke = (strength: number, direction: number) => {
  const test = world?.waterTest
  if (!test || P.tested <= 0) return
  test.poke(strength, direction)
  sound.slosh(strength)
  say('slosh')
}
$('[data-poke]').addEventListener('click', () => poke(0.9, Math.random() < 0.5 ? -1 : 1))
window.addEventListener('pointerdown', (e) => {
  const drop = world?.waterOnScreen()
  if (!drop || (e.target as Element | null)?.closest('a, button')) return
  const d = Math.hypot(e.clientX - drop.x, e.clientY - drop.y)
  if (d < drop.r * 1.3) poke(0.9, e.clientX < drop.x ? 1 : -1)
})

// Sounds of the world: packets knocking, the balloon bumping (and the headline it hits wobbling).
if (world) {
  const w = world as World
  w.onKnock((strength, x) => sound.tap(strength, x))
  w.onBump((strength, element) => {
    sound.squeak(0.4 + strength * 0.6)
    if (!element) return
    const el = element as HTMLElement
    el.style.setProperty('--hx', `${(Math.random() - 0.5) * 16}px`)
    el.style.setProperty('--hy', `${(Math.random() - 0.5) * 10}px`)
    el.style.setProperty('--hr', `${(Math.random() - 0.5) * 3}deg`)
    el.classList.remove('is-hit')
    void el.offsetWidth
    el.classList.add('is-hit')
  })
  w.collide([...document.querySelectorAll('.chapter-title, .quote p')])
}

// ---------------------------------------------------------------------
// The director: the world's state from where every chapter is.
// ---------------------------------------------------------------------
let lastTear = 0
let lastUnroll = 0
let lastLitres = 0
let lastTested = 0
const TURN = Math.PI * 2 - 0.3
function direct(dt: number) {
  if (!world) return
  const s = world.state
  const w = world.layer.width
  const h = world.layer.height
  const narrow = w < 760

  // The cloud: in with the opening, thinning as a packet comes forward, gone once it's torn.
  s.cloud = opening.amount * (P.rip > 0 ? 0.3 * (1 - smoothstep(0, 0.5, P.rip)) : 1 - 0.7 * smoothstep(0, 0.4, P.zero))

  // The featured packet: forward and turning over in 00; front on, torn, and back into the dark in 01.
  if (P.rip > 0) {
    // Torn, emptied, it drops back into the dark — before the ring comes down past it.
    s.feature = 1 - smoothstep(0.55, 0.85, P.rip)
    s.turn = reduced ? 0 : TURN
  } else {
    s.feature = smoothstep(0, 0.32, P.zero)
    s.turn = reduced ? 0 : -0.3 + smoothstep(0.38, 0.95, P.zero) * Math.PI * 2
  }
  s.x = narrow ? 0 : w * 0.2
  // In 01 it settles lower and a little smaller: room above it for the ring to come out.
  const settle = smoothstep(0, 0.15, P.rip)
  s.y = lerp(narrow ? -h * 0.18 : 0, narrow ? -h * 0.24 : -h * 0.16, settle)
  s.scale = lerp(narrow ? Math.min(w * 0.68, h * 0.42) : Math.min(w * 0.36, h * 0.62), narrow ? Math.min(w * 0.56, h * 0.34) : Math.min(w * 0.3, h * 0.46), settle) / 54
  s.tear = smoothstep(0.05, 0.38, P.rip)
  s.fly = smoothstep(0.36, 0.7, P.rip)
  if (s.tear > 0.05 && lastTear <= 0.05) {
    sound.rip()
    say('rip')
  }
  lastTear = s.tear

  // The condom: out of the packet, unrolled, blown up.
  const past = (p: number) => p > 0
  s.ring = past(P.roll) || past(P.pump) || past(P.letgo) || past(P.tested) ? 1 : smoothstep(0.34, 0.95, P.rip)
  s.unroll = past(P.pump) || past(P.letgo) || past(P.tested) ? 1 : smoothstep(0.08, 0.8, P.roll)
  if (s.unroll - lastUnroll > 0.08) {
    sound.squeak(0.6)
    say('roll')
    lastUnroll = s.unroll
  } else if (s.unroll < lastUnroll) lastUnroll = s.unroll
  if (P.roll < 0.9 && !past(P.pump)) pumped = 0
  const scrolled = 40 * smoothstep(0.1, 0.7, P.pump)
  let litres = past(P.letgo) || past(P.tested) ? Math.max(pumped, 40) : Math.max(pumped, scrolled)
  // Reduced motion, let go: it empties where it is.
  if (chosen === 'go' && reduced) {
    deflate = Math.max(0, deflate - dt / 1.5)
    litres *= deflate
  }
  s.litres = litres
  s.standX = narrow ? 0 : w * 0.22
  // On a phone the pump's copy is long: the balloon grows small, at the foot of the screen.
  const low = narrow ? smoothstep(0, 1, P.pumpIn) : 0
  s.standY = narrow ? -h * (0.16 + 0.15 * low) : -h * 0.02
  s.standHeight = narrow ? 0.46 - 0.16 * low : 0.62

  const balloon = world.balloon
  if (balloon) {
    // Let go: unless chosen, it gets away by itself; scrolling back up undoes it.
    if (P.letgo > 0.32 && !chosen) choose('go', 'auto')
    if (!past(P.letgo) && !past(P.tested) && P.pump < 0.999) unchoose()
    if (balloon.mode === 'flying' && balloon.group.visible) sound.air(balloon.pressure, balloon.flow)
    else if (chosen === 'go') sound.air(0, 0)
    if (balloon.mode === 'fallen' && status.dataset.fallen !== '1') {
      status.dataset.fallen = '1'
      status.textContent = 'It always comes back down.'
    } else if (balloon.mode !== 'fallen') delete status.dataset.fallen
  }

  // 05 — the water test, lowered in and taken away.
  s.water = P.tested > 0 ? 1 - smoothstep(0.88, 1, P.tested) : smoothstep(0.5, 1, P.testedIn)
  s.waterX = narrow ? w * 0.18 : w * 0.24
  s.waterY = narrow ? -h * 0.1 : h * 0.42
  if (P.tested > 0.12 && lastTested <= 0.12) window.setTimeout(() => poke(0.5, -1), 300)
  lastTested = P.tested

  // 06 — the balloons rise.
  s.rise = smoothstep(0.05, 0.6, P.play)

  // The zones: as strong as their copy is present.
  zones.hero.amount = 1 - range(P.top, 0, 0.6)
  zones.zero.amount = Math.min(P.zeroIn, 1 - smoothstep(0.92, 1, P.zero))
  zones.rip.amount = Math.min(P.ripIn, 1 - smoothstep(0.92, 1, P.rip))
}
stage.onFrame((frame) => {
  direct(Math.min(frame.delta, 1 / 20))
  sound.update()
}, 40)

/** The gauge: what the shape holds — read once the world has shaped it this frame. */
function readGauge() {
  const balloon = world?.balloon
  if (!balloon) return
  const held = balloon.condom.volume
  const text = held.toFixed(1)
  if (gauge.textContent !== text) gauge.textContent = text
  for (const m of milestones) m.classList.toggle('is-reached', held >= Number(m.dataset.litres) - 0.5)
  // The latex squeaks as it stretches.
  if (balloon.mode === 'scripted' && held - lastLitres > 3) {
    sound.squeak(0.45)
    lastLitres = held
  } else if (held < lastLitres) lastLitres = held
}
stage.onFrame(readGauge, 60)
