// End-to-end verification of the production build, served under the real
// GitHub Pages base path (/durex/).
//
//   npm run build && npm run verify            # portable: WebGL on SwiftShader
//   npm run build && npm run verify -- --gpu   # on the GPU (Metal on a Mac, Direct3D on Windows)
//
// Checks: no console errors or failed requests, English semantics and copy,
// the disclaimer, the sources and the commission address, keyboard entry,
// the gate (with sound: the cry plays; silent: it doesn't), the opening and
// the packets (kept clear of the copy), «Zero gravity» and its featured packet, the models page (the
// volume a shape holds), reduced motion, mobile overflow, and the drawn
// packet without WebGL. Screenshots go to verify-output/. Exits non-zero on failure.
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

try {
  await waitForServer()
  const browser = await chromium.launch({ args: GL_ARGS })

  await visit(browser, `Desktop 1440×900${GPU ? ' (GPU)' : ''}`, '?capture', { viewport: { width: 1440, height: 900 } }, async (page) => {
    const meta = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      h1: document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim(),
      disclaimer: document.querySelector('.disclaimer')?.textContent ?? '',
      sources: document.querySelectorAll('.sources li').length,
      mail: document.querySelector('.commission a')?.getAttribute('href') ?? '',
    }))
    check(meta.lang === 'en', `lang="${meta.lang}"`)
    check(meta.h1 === 'Annoying, isn’t it?', `h1 is the headline in real text (${meta.h1})`)
    check(meta.disclaimer.includes('unofficial') && meta.disclaimer.includes('not commissioned'), 'unofficial-concept disclaimer is present')
    check(meta.sources >= 2, `the facts carry their sources (${meta.sources})`)
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
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(1500)
    const gone = await page.evaluate(() => window.__durex.world?.state.feature)
    check(gone < 0.01, `…and lets it go at the end (${gone?.toFixed(2)})`)
    await page.screenshot({ path: `${OUT}desktop-footer.png` })
  })

  await visit(browser, 'With sound', '?capture', { viewport: { width: 1280, height: 800 } }, async (page) => {
    await open(page, 'sound')
    const s = await page.evaluate(() => ({ cried: window.__durex.cried, audio: window.__durex.stage.sound?.context?.state, pressed: document.querySelector('.sound-toggle').getAttribute('aria-pressed') }))
    check(s.cried === true && s.audio === 'running', `play it: the cry plays (${s.audio})`)
    check(s.pressed === 'true', 'the HUD toggle says sound is on')
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
      out.forty = { volume: m.condom.volume, top: m.condom.top, width: m.condom.width }
      return out
    })
    check(shapes.ring.top - shapes.ring.bottom < 25, `rolled up it is a ring (${(shapes.ring.top - shapes.ring.bottom).toFixed(1)} mm tall)`)
    check(Math.abs(shapes.unrolled.top - 180) < 2 && shapes.unrolled.volume < 0.3, `unrolled it is 180 mm long (${shapes.unrolled.top.toFixed(0)} mm, ${shapes.unrolled.volume.toFixed(2)} L)`)
    check(Math.abs(shapes.eighteen - 18) < 0.5 && Math.abs(shapes.forty.volume - 40) < 0.8, `the gauge reads what the shape holds (${shapes.eighteen.toFixed(1)} L, ${shapes.forty.volume.toFixed(1)} L)`)
    check(shapes.forty.top > 600 && shapes.forty.width > 120, `forty litres is a long balloon (${(shapes.forty.top / 10).toFixed(0)} cm tall, ${((shapes.forty.width * 2) / 10).toFixed(0)} cm wide)`)
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
  })

  await visit(browser, 'Reduced motion', '?capture', { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, async (page) => {
    await open(page, 'silent')
    const state = await page.evaluate(() => ({ reduced: document.documentElement.classList.contains('reduced'), title: getComputedStyle(document.querySelector('.hero-title')).opacity }))
    check(state.reduced && state.title === '1', 'the headline reads at once, without motion')
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
