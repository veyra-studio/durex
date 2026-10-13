/**
 * The loader is a foil packet's tear edge: a row of zigzag teeth that turn
 * crimson as the film loads; at 100% it tears — the teeth fly apart.
 */
import type { Stage } from '@veyra/core'

export interface Loader {
  progress(p: number): void
  finish(stage: Stage, onTear?: () => void): Promise<void>
}

export function initLoader(): Loader {
  const root = document.querySelector<HTMLElement>('.loader')!
  const strip = root.querySelector<SVGGElement>('.loader-teeth')!
  const num = root.querySelector<HTMLElement>('.loader-num')!
  const N = 22
  const W = 600
  const step = W / N
  const teeth: SVGPathElement[] = []
  for (let i = 0; i < N; i++) {
    const x = i * step
    const tooth = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    tooth.setAttribute('d', `M${x} 30 L${x + step / 2} 12 L${x + step} 30 L${x + step / 2} 48 Z`)
    strip.append(tooth)
    teeth.push(tooth)
  }
  let shown = -1
  return {
    progress(p) {
      const on = Math.round(p * N)
      if (on === shown) return
      shown = on
      teeth.forEach((t, i) => t.classList.toggle('is-on', i < on))
      num.textContent = String(Math.round(p * 100))
    },
    async finish(stage, onTear) {
      this.progress(1)
      if (stage.reducedMotion.value) {
        root.classList.add('is-done')
        return
      }
      await new Promise((r) => setTimeout(r, 200))
      onTear?.()
      // Torn: each tooth flies off, up or down.
      const tl = stage.timeline()
      teeth.forEach((t, i) => {
        const up = i % 2 === 0 ? -1 : 1
        tl.to(t, { y: up * (40 + Math.random() * 80), x: (Math.random() - 0.5) * 60, rotate: (Math.random() - 0.5) * 120, opacity: 0 }, { duration: 0.8, ease: 'expoOut' }, i * 0.012)
      })
      tl.to(root.querySelectorAll('.loader-label, .loader-count'), { opacity: 0, y: 10 }, { duration: 0.4 }, 0)
      tl.play()
      await new Promise((r) => setTimeout(r, 380))
      root.classList.add('is-done')
      await tl.finished
    },
  }
}
