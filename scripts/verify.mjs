// End-to-end verification of the production build, served under the real
// GitHub Pages base path (/durex/).
//
//   npm run build && npm run verify            # portable: WebGL on SwiftShader
//   npm run build && npm run verify -- --gpu   # on the GPU (Metal on a Mac, Direct3D on Windows)
//
// Checks: no console errors or failed requests, English semantics and copy,
// the disclaimer, the sources (every citation resolves), the recordings'
// credits and the commission address, keyboard entry, the gate (with sound:
// the cry plays; silent: it doesn't), the opening and the packets (kept
// clear of the copy), and the film chapter by chapter — the featured packet,
// the tear, the unroll, pumping by mouse, space bar and scroll with the
// gauge reading the shape, letting go (it flies, empties and lands inside
// the screen) or tying it (it comes along), the water test swinging when
// poked, the balloons rising — the models page (the volume a shape holds,
// the sound board), reduced motion (no flight: it empties in place), every
// chapter on a phone without overflow, and the drawn packet without WebGL.
// Screenshots go to verify-output/. Exits non-zero on failure.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const PORT = 4174
const BASE = `http://localhost:${PORT}/durex/`
const OUT = fileURLToPath(new URL('../verify-output/', import.meta.url))
const GPU = process.argv.includes('--gpu')
const WINDOWS = process.platform === 'win32'
const GPU_ANGLE = process.platform === 'darwin' ? 'metal' : WINDOWS ? 'd3d11' : 'default'
const GL_ARGS = GPU ? [`--use-angle=${GPU_ANGLE}`, '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// Vite's preview server, stopped with the run (no process groups on Windows).
const root = fileURLToPath(new URL('..', import.meta.url))
const server = spawn(process.execPath, [`${root}node_modules/vite/bin/vite.js`, 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
  detached: !WINDOWS,
  windowsHide: true,
})
const stopServer = () => {
  try {
    if (WINDOWS) server.kill()
    else process.kill(-server.pid, 'SIGTERM')
  } catch {}
}

const failures = []
const fail = (msg) => {
  failures.push(msg)
  console.log(`  ✗ ${msg}`)
}
const pass = (msg) => console.log(`  ✓ ${msg}`)
const check = (ok, msg) => (ok ? pass(msg) : fail(msg))

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('preview server did not start')
}

async function visit(browser, name, path, options, steps) {
  console.log(`\n${name}`)
  const context = await browser.newContext(options)
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`))
  page.on('requestfailed', (r) => errors.push(`request failed ${r.url()} ${r.failure()?.errorText}`))
  // Download managers (IDM and the like) grab every audio file a page fetches: the sounds travel as data in scripts.
  page.on('request', (r) => /\.(mp3|ogg|wav|m4a|aac|flac)(\?|$)/i.test(r.url()) && errors.push(`audio file fetched ${r.url()}`))
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' })
  try {
    await steps(page)
  } catch (error) {
    fail(`${name}: ${error?.stack ?? error}`)
  }
  errors.length ? fail(`${name}: ${errors.length} console/network error(s):\n    ${errors.join('\n    ')}`) : pass(`${name}: no console or network errors`)
  await context.close()
}

/** Through the gate, then waits for the punchline. */
async function open(page, choice) {
  await page.waitForSelector('.gate:not([hidden])', { timeout: 120000 })
  await page.click(`[data-gate="${choice}"]`)
  await page.waitForFunction(() => document.documentElement.classList.contains('is-open'), null, { timeout: 60000 })
}
/** Frame time runs slow on software rendering: waits for the entrance, then for packets to leave the copy. Returns how many are in it. */
async function settled(page) {
  await page.waitForFunction(() => window.__durex.world?.state.cloud > 0.99, null, { timeout: 30000 }).catch(() => {})
  await page.waitForFunction(() => window.__durex.world?.inZones() === 0, null, { timeout: 40000 }).catch(() => {})
  return page.evaluate(() => window.__durex.world?.inZones())
}
const scrollTo = (page, sel, p) =>
  page.evaluate(
    ([s, f]) => {
      const el = document.querySelector(s)
      window.scrollTo(0, el.getBoundingClientRect().top + scrollY + Math.max(0, el.offsetHeight - innerHeight) * f)
    },
    [sel, p],
  )
/** Waits for a condition in the page (frame time runs slow on software rendering), quietly. */
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout }).catch(() => {})
const balloon = (page) => page.evaluate(() => ({ mode: window.__durex.world.balloon.mode, volume: window.__durex.world.balloon.condom.volume }))
/** The largest swing of the water test over `ms`. */
const swingPeak = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const t0 = performance.now()
        let peak = 0
        const look = () => {
          peak = Math.max(peak, window.__durex.world.waterTest.swing)
          if (performance.now() - t0 < ms) requestAnimationFrame(look)
          else resolve(peak)
        }
        look()
      }),
    ms,
  )
/** Blows it up by scrolling through «Pump», then goes to «Let go». */
async function blowUp(page) {
  await until(page, () => window.__durex.more === true, null, 120000)
  await scrollTo(page, '#pump', 0.9)
  await until(page, () => window.__durex.world.balloon.condom.volume > 39.2)
  await scrollTo(page, '#letgo', 0.12)
  await page.waitForTimeout(600)
}

try {
  await waitForServer()
  const browser = await chromium.launch({ args: GL_ARGS })

  await visit(browser, `Desktop 1440×900${GPU ? ' (GPU)' : ''}`, '?capture', { viewport: { width: 1440, height: 900 } }, async (page) => {
    const meta = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      h1: document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim(),
      disclaimer: document.querySelector('.disclaimer')?.textContent ?? '',
      sources: document.querySelectorAll('.sources li').length,
      cited: [...document.querySelectorAll('sup a[href^="#source-"]')].every((a) => document.querySelector(a.getAttribute('href'))),
      credits: document.querySelectorAll('.credits a[href*="freesound.org"]').length,
      music: !!document.querySelector('.credits a[href*="incompetech.com"]') && !!document.querySelector('.credits a[href="https://creativecommons.org/licenses/by/4.0/"]'),
      mail: document.querySelector('.commission a')?.getAttribute('href') ?? '',
    }))
    check(meta.lang === 'en', `lang="${meta.lang}"`)
    check(meta.h1 === 'Annoying, isn’t it?', `h1 is the headline in real text (${meta.h1})`)
    check(meta.disclaimer.includes('unofficial') && meta.disclaimer.includes('not commissioned'), 'unofficial-concept disclaimer is present')
    check(meta.sources >= 6 && meta.cited, `the facts carry their sources, every citation resolves (${meta.sources})`)
    check(meta.credits === 8, `the recordings are credited (${meta.credits})`)
    check(meta.music, 'the music is credited, with its licence (CC BY 4.0)')
    check(meta.mail.startsWith('mailto:itsmetti@proton.me'), 'the footer offers a site like this, by mail')
    await page.waitForSelector('.gate:not([hidden])', { timeout: 120000 })
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim())
    check(Boolean(focused), `keyboard reaches the gate (${focused})`)
    await page.screenshot({ path: `${OUT}desktop-gate.png` })
    await open(page, 'silent')
    // The pointer rests in a corner, out of the packets' way.
    await page.mouse.move(1435, 895)
    const silent = await page.evaluate(() => window.__durex.cried)
    check(silent === false, 'silent, please: no cry')
    const inHero = await settled(page)
    await page.screenshot({ path: `${OUT}desktop-hero.png` })
    const cloud = await page.evaluate(() => ({ cloud: window.__durex.world?.state.cloud, count: window.__durex.world?.count }))
    check(cloud.cloud > 0.99 && cloud.count >= 6, `packets float in (${cloud.count}, cloud ${cloud.cloud?.toFixed(2)})`)
    check(inHero === 0, `…clear of the headline (${inHero} in the way)`)
    const built = await page.evaluate(() => ({ detail: window.__durex.world?.detail, count: window.__durex.world?.count, tier: window.__durex.stage.quality?.tier.value }))
    check(built.count === { low: 6, medium: 10, high: 14 }[built.tier], `the cloud follows the quality tier (${built.count} packets at ${built.tier})`)
    // A software renderer lowers the quality as the layer is made: the world must see it.
    if (!GPU) check(built.detail === 'low', `no GPU: the packets are built light (${built.detail})`)
    await scrollTo(page, '#zero', 0.5)
    await page.waitForTimeout(1000)
    const inZero = await settled(page)
    await page.screenshot({ path: `${OUT}desktop-zero.png` })
    const zero = await page.evaluate(() => window.__durex.world?.state.feature)
    check(zero > 0.95, `«Zero gravity» brings a packet forward (${zero?.toFixed(2)})`)
    check(inZero === 0, `…and the others leave its copy alone (${inZero} in the way)`)

    // 01 — torn open, the ring out.
    await until(page, () => window.__durex.more === true, null, 120000)
    await scrollTo(page, '#rip', 0.6)
    await until(page, () => window.__durex.world.state.tear > 0.99 && window.__durex.world.state.ring > 0.3)
    const rip = await page.evaluate(() => ({ tear: window.__durex.world.state.tear, ring: window.__durex.world.state.ring }))
    check(rip.tear > 0.99 && rip.ring > 0.3, `01 — the packet tears open and the ring comes out (tear ${rip.tear.toFixed(2)}, ring ${rip.ring.toFixed(2)})`)
    await page.screenshot({ path: `${OUT}desktop-rip.png` })
    // 02 — unrolled.
    await scrollTo(page, '#roll', 0.95)
    await until(page, () => window.__durex.world.balloon.condom.unroll > 0.99)
    const roll = await page.evaluate(() => ({ unroll: window.__durex.world.balloon.condom.unroll, top: window.__durex.world.balloon.condom.top }))
    check(roll.unroll > 0.99 && Math.abs(roll.top - 180) < 2, `02 — it unrolls to 180 mm (${roll.top.toFixed(0)} mm)`)
    await page.screenshot({ path: `${OUT}desktop-roll.png` })
    // 03 — pumped: the mouse, the space bar, the scroll; the gauge reads the shape. The button
    // works as soon as the chapter is on screen, before its pin takes hold.
    await page.evaluate(() => window.scrollTo(0, document.querySelector('#pump').getBoundingClientRect().top + scrollY - innerHeight * 0.25))
    await page.waitForTimeout(800)
    const pump = await (await page.$('[data-pump]')).boundingBox()
    await page.mouse.move(pump.x + pump.width / 2, pump.y + pump.height / 2)
    await page.mouse.down()
    await until(page, () => window.__durex.world.balloon.condom.volume > 6)
    await page.mouse.up()
    const byMouse = (await balloon(page)).volume
    check(byMouse > 6, `03 — holding the button blows it up (${byMouse.toFixed(1)} L)`)
    await page.focus('[data-pump]')
    await page.keyboard.down('Space')
    await until(page, (v) => window.__durex.world.balloon.condom.volume > v + 2, byMouse)
    await page.keyboard.up('Space')
    const byKey = (await balloon(page)).volume
    check(byKey > byMouse + 2, `…so does holding the space bar (${byKey.toFixed(1)} L)`)
    const gauge = await page.evaluate(() => ({ text: document.querySelector('.gauge-num').textContent, volume: window.__durex.world.balloon.condom.volume.toFixed(1) }))
    check(gauge.text === gauge.volume, `the gauge reads what the shape holds (${gauge.text} L)`)
    await scrollTo(page, '#pump', 0.9)
    await until(page, () => window.__durex.world.balloon.condom.volume > 39.2)
    const full = await page.evaluate(() => ({ volume: window.__durex.world.balloon.condom.volume, reached: document.querySelectorAll('.milestone.is-reached').length }))
    check(Math.abs(full.volume - 40) < 0.8 && full.reached === 2, `scrolled through, 40 litres — still holding (${full.volume.toFixed(1)} L, ${full.reached} milestones)`)
    await page.screenshot({ path: `${OUT}desktop-pump.png` })
    // 04 — let go: off round the page, and down.
    await scrollTo(page, '#letgo', 0.12)
    await page.waitForTimeout(600)
    const walls = await page.evaluate(() => window.__durex.world.physics.bodies.filter((b) => b.userData instanceof Element).length)
    check(walls >= 7, `the headlines are walls it can hit (${walls})`)
    await page.click('[data-letgo="go"]')
    await until(page, () => window.__durex.world.balloon.mode === 'flying', null, 10000)
    check((await balloon(page)).mode === 'flying', '04 — let go, it flies')
    await page.screenshot({ path: `${OUT}desktop-letgo.png` })
    await until(page, () => window.__durex.world.balloon.mode === 'fallen', null, 60000)
    await page.waitForTimeout(2000)
    // Spent, it drops — to the floor, or onto a headline — and stays on screen.
    await until(page, () => Math.hypot(window.__durex.world.balloon.body.velocity.x, window.__durex.world.balloon.body.velocity.y) < 40, null, 20000)
    const down = await page.evaluate(() => {
      const w = window.__durex.world
      const p = w.balloon.body.position
      const v = w.balloon.body.velocity
      return { mode: w.balloon.mode, x: p.x, y: p.y, speed: Math.hypot(v.x, v.y), w: w.layer.width / 2, h: w.layer.height / 2, status: document.querySelector('.letgo-status').textContent }
    })
    check(down.mode === 'fallen' && Math.abs(down.x) <= down.w && Math.abs(down.y) <= down.h && down.speed < 40, `…empties, and comes to rest on screen (${down.x.toFixed(0)}, ${down.y.toFixed(0)}, ${down.speed.toFixed(0)} px/s)`)
    check(down.status.includes('comes back down'), `…and the page says so («${down.status}»)`)
    // 05 — the water test, poked.
    await scrollTo(page, '#tested', 0.3)
    await until(page, () => window.__durex.world.state.water > 0.99)
    await page.waitForTimeout(3000)
    const calm = await swingPeak(page, 700)
    await page.click('[data-poke]')
    const swung = await swingPeak(page, 1200)
    check(swung > 0.15 && swung > calm, `05 — poked, the drop swings (${calm.toFixed(2)} → ${swung.toFixed(2)} rad)`)
    await page.screenshot({ path: `${OUT}desktop-tested.png` })
    // 06 — the balloons rise.
    await scrollTo(page, '#playsafe', 0.6)
    await until(page, () => window.__durex.world.state.rise > 0.5)
    const rise = await page.evaluate(() => window.__durex.world.state.rise)
    check(rise > 0.5, `06 — the balloons rise (${rise.toFixed(2)})`)
    await page.screenshot({ path: `${OUT}desktop-playsafe.png` })
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(1500)
    const gone = await page.evaluate(() => window.__durex.world?.state.feature)
    check(gone < 0.01, `…and lets it go at the end (${gone?.toFixed(2)})`)
    await page.screenshot({ path: `${OUT}desktop-footer.png` })
  })

  await visit(browser, 'With sound', '?capture', { viewport: { width: 1280, height: 800 } }, async (page) => {
    await page.waitForSelector('.gate:not([hidden])', { timeout: 120000 })
    const clicked = Date.now()
    await page.click('[data-gate="sound"]')
    await page.waitForFunction(() => document.documentElement.classList.contains('is-open'), null, { timeout: 60000 })
    const punchline = (Date.now() - clicked) / 1000
    const s = await page.evaluate(() => ({ cried: window.__durex.cried, audio: window.__durex.stage.sound?.context?.state, pressed: document.querySelector('.sound-toggle').getAttribute('aria-pressed') }))
    check(s.cried === true && s.audio === 'running', `play it: the cry plays (${s.audio})`)
    check(punchline < 4, `…and the punchline lands right after it (${punchline.toFixed(1)} s)`)
    check(s.pressed === 'true', 'the HUD toggle says sound is on')
    await until(page, () => window.__durex.sound.musicPlaying === true, null, 30000)
    check(await page.evaluate(() => window.__durex.sound.musicPlaying), 'then the music plays, low behind it')
    // Tie it: kept, it floats along into the next chapter.
    await blowUp(page)
    await page.click('[data-letgo="tie"]')
    await until(page, () => window.__durex.world.balloon.mode === 'tied', null, 10000)
    const status = await page.evaluate(() => document.querySelector('.letgo-status').textContent)
    check((await balloon(page)).mode === 'tied' && status.startsWith('Tied'), `04 — tie it: it stays («${status}»)`)
    await scrollTo(page, '#tested', 0.3)
    await page.waitForTimeout(1500)
    const kept = await page.evaluate(() => ({ mode: window.__durex.world.balloon.mode, shown: window.__durex.world.balloon.group.visible, volume: window.__durex.world.balloon.condom.volume }))
    check(kept.mode === 'tied' && kept.shown && kept.volume > 39, `…and comes along to the water test, still full (${kept.volume.toFixed(1)} L)`)
    await page.screenshot({ path: `${OUT}sound-tied.png` })
  })

  await visit(browser, 'The models', 'models.html', { viewport: { width: 1280, height: 800 } }, async (page) => {
    await page.waitForFunction(() => window.__models, null, { timeout: 120000 })
    const shapes = await page.evaluate(() => {
      const m = window.__models
      const out = {}
      m.set(0, 0)
      out.ring = { bottom: m.condom.bottom, top: m.condom.top }
      m.set(1, 0)
      out.unrolled = { bottom: m.condom.bottom, top: m.condom.top, volume: m.condom.volume }
      m.set(1, 18)
      out.eighteen = m.condom.volume
      m.set(1, 40)
      out.forty = { volume: m.condom.volume, top: m.condom.top, bottom: m.condom.bottom, width: m.condom.width }
      return out
    })
    check(shapes.ring.top - shapes.ring.bottom < 25, `rolled up it is a ring (${(shapes.ring.top - shapes.ring.bottom).toFixed(1)} mm tall)`)
    check(Math.abs(shapes.unrolled.top - 180) < 2 && shapes.unrolled.volume < 0.3, `unrolled it is 180 mm long (${shapes.unrolled.top.toFixed(0)} mm, ${shapes.unrolled.volume.toFixed(2)} L)`)
    check(Math.abs(shapes.eighteen - 18) < 0.5 && Math.abs(shapes.forty.volume - 40) < 0.8, `the gauge reads what the shape holds (${shapes.eighteen.toFixed(1)} L, ${shapes.forty.volume.toFixed(1)} L)`)
    const tall = shapes.forty.top - shapes.forty.bottom
    check(shapes.forty.width > 170 && tall / (shapes.forty.width * 2) < 1.9, `forty litres is a big, round balloon (${(tall / 10).toFixed(0)} cm tall, ${((shapes.forty.width * 2) / 10).toFixed(0)} cm wide)`)
    const board = await page.evaluate(() => document.querySelectorAll('[data-sound]').length)
    check(board === 8, `every sound can be listened to on its own (${board})`)
    await page.screenshot({ path: `${OUT}models.png` })
  })

  await visit(browser, 'Mobile 390×844 (touch)', '?capture', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, async (page) => {
    await open(page, 'silent')
    await page.mouse.move(385, 840)
    const inHero = await settled(page)
    check(inHero === 0, `the packets keep clear of the headline on a phone too (${inHero} in the way)`)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(overflow <= 1, `no horizontal overflow (${overflow}px)`)
    await page.screenshot({ path: `${OUT}mobile-hero.png` })
    await scrollTo(page, '#zero', 0.5)
    await page.waitForTimeout(1000)
    const inZero = await settled(page)
    check(inZero === 0, `…and of the chapter's copy (${inZero} in the way)`)
    await page.screenshot({ path: `${OUT}mobile-zero.png` })
    // Every chapter fits the screen.
    let widest = 0
    for (const id of ['#rip', '#roll', '#pump', '#letgo', '#tested', '#playsafe']) {
      await scrollTo(page, id, 0.5)
      await page.waitForTimeout(300)
      widest = Math.max(widest, await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    }
    check(widest <= 1, `no chapter overflows the screen (${widest}px)`)
    await page.screenshot({ path: `${OUT}mobile-playsafe.png` })
  })

  await visit(browser, 'Reduced motion', '?capture', { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, async (page) => {
    await open(page, 'silent')
    const state = await page.evaluate(() => ({ reduced: document.documentElement.classList.contains('reduced'), title: getComputedStyle(document.querySelector('.hero-title')).opacity }))
    check(state.reduced && state.title === '1', 'the headline reads at once, without motion')
    // Let go without the flight: it empties where it is.
    await blowUp(page)
    await page.click('[data-letgo="go"]')
    await until(page, () => window.__durex.world.balloon.condom.volume < 0.5, null, 20000)
    const spent = await balloon(page)
    check(spent.mode === 'scripted' && spent.volume < 0.5, `let go, it empties where it is — no flight (${spent.mode}, ${spent.volume.toFixed(1)} L)`)
  })

  await browser.close()

  // Without WebGL the drawn packet stands in.
  const noGl = await chromium.launch({ args: ['--disable-3d-apis', '--disable-webgl'] })
  await visit(noGl, 'No WebGL (drawn packet)', '', { viewport: { width: 1280, height: 800 } }, async (page) => {
    await open(page, 'silent')
    const shown = await page.evaluate(() => document.documentElement.classList.contains('no-webgl') && getComputedStyle(document.querySelector('.fallback-packet')).display !== 'none')
    check(shown, 'no-webgl: the drawn packet is shown')
    await page.screenshot({ path: `${OUT}nogl-hero.png` })
  })
  await noGl.close()
} catch (error) {
  fail(String(error?.stack ?? error))
} finally {
  stopServer()
}

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed')
process.exit(failures.length ? 1 : 0)
