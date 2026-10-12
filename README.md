# Durex — «Zero gravity.»

**Status: planned, not built yet.** This is the concept and the build plan for Veyra's second showcase: an English, art-directed campaign concept for Durex condoms, made with the [Veyra](https://github.com/veyra-studio/veyra-core) engine. The plan for all Veyra repositories lives in [veyra-core/docs/PLAN.md](https://github.com/veyra-studio/veyra-core/blob/main/docs/PLAN.md) (Phase 6).

> **Independent and unofficial.** A concept piece made to demonstrate Veyra — not commissioned by, affiliated with, or endorsed by Reckitt or Durex. Durex and its marks belong to their owners. (This line ships in the footer.)

## The idea

Everything floats. Foil packets drift in a dark studio like objects in orbit; you tear one open, the ring unrolls into a sheer, glossy sheath, you blow it up like a balloon — and let it go. It shoots around the page, squealing, bouncing off the screen's edges and off the page's own headlines, then sags to the floor. The joke is the one every teenager knows; the point is the one the brand makes: strong enough to hold forty litres of air, thin enough to forget.

- **Language:** English, left to right.
- **Tone:** witty and luxurious. Product shots lit like Active Theory's and Santioni's dark, glossy worlds; copy in short, dry, double-meaning lines in Durex's own spirit. Playful, never explicit: no bodies, no acts, nothing a billboard couldn't carry.
- **Working line:** «Zero gravity. Zero worries.» (to test: «Made to be blown away.», «Handle with pleasure.»)

## The film

| # | Chapter | What happens | Veyra at work |
| --- | --- | --- | --- |
| — | Loader | A foil packet's serrated edge lights up tooth by tooth as the film loads; at 100% its corner tears off with a rip. | `Preloader`, timelines, `SoundBus.burst` |
| 00 | **Zero gravity** | Foil packets hang weightless in a dark studio, turning slowly, catching the light in their crinkles. The pointer (or a finger) pushes them aside; a tap sends one spinning. The headline stands among them. | three.js layer, instancing, springs, studio light, a pointer force field |
| 01 | **Rip** | One packet drifts forward. Drag along its zigzag edge — or just scroll — and it tears along a jagged line; the corner tumbles away in zero gravity, the ring floats out. | `draggable`, scroll-triggered real-time events, a torn mesh, rigid bodies |
| 02 | **Roll** | Scroll and the ring unrolls into a sheer, glossy sheath, light running along it. «Thin enough to forget.» | a vertex-shader unroll, a thin-film latex material |
| 03 | **Pump** *(the owner's idea)* | Hold the mouse, a finger or Space and it inflates like a balloon, wobbling as it grows. A gauge counts litres: past 18 — «the international standard» — on toward 40, «what Durex says a typical one holds». At the top: «Still holding.» | press-and-hold input with a keyboard path, a profile that swells with pressure, springs, `SoundBus` |
| 04 | **Let go** *(the owner's idea)* | Release it and it rockets off like an untied balloon: thrust from the escaping air, spinning, bouncing off the screen's edges and off the real headlines on the page (they wobble when hit), squealing «pfffrrrt» as the pressure — and the pitch — drops; then it sags to the floor. Or **Tie it**: it stays, a balloon that drifts along with you through the rest of the film and can be batted about. | light rigid-body physics with sub-steps; DOM elements as colliders through the pixel camera; a continuous synthesized voice |
| 05 | **Tested** | A condom filled with water hangs in the light and wobbles when you poke it. The facts, in Durex's words: every condom electronically tested; samples from every batch filled with air and with water; one failure, and the whole batch stays in the factory. | a soft body (springs), refraction, scroll-revealed copy |
| 06 | **Play safe** | Dozens of balloons in the packaging's colours rise into the dark; the pointer parts them. One sourced public-health line; the disclaimer; the studio's line: «Want a site like this? itsmetti@proton.me». | instancing, springs, `marquee` |

Everything visual is generated live, as in Abali: no product photos, no model files. The packet is a pillow of foil with crimped seams, a crinkle normal map and anisotropic highlights, its artwork drawn to canvas; the condom is a turned profile (`Profile`) — a reservoir tip, the sheath, the rolled rim — in a thin-film latex material (Fresnel opacity, sheen, a touch of iridescence; no transmission, so phones can carry it). Colours are sampled from photographs of the real packaging, used for reference only and not committed.

## Facts the copy may use

Only well-sourced facts, attributed where they are the brand's own claims, each listed in the footer. Re-check every one against its source when building.

- A typical Durex condom holds about **40 litres** of air in the burst test; the international standard asks for **18** (Durex UK, *What quality tests do Durex condoms go through?*). ISO 4074's minimum burst volume depends on width — 16, 18 or 22 litres — with a minimum burst pressure of 1.0 kPa (UNFPA's corrigendum to the WHO/UNFPA male latex condom specification).
- **Every** Durex condom is electronically tested; samples from each batch are inflated and filled with water; if one sample fails, the whole batch — up to 432,000 condoms — doesn't leave the factory (Durex UK and Durex Nigeria quality pages).
- The London Rubber Company was founded in London in 1915; the Durex trademark dates from 1929, its name commonly explained as *durability, reliability, excellence* (an accepted explanation, not a documented founding statement — say so, or leave it out); Reckitt has owned the brand since 2010 (Wikipedia, *Durex*).
- The public-health line in the finale quotes the WHO or the CDC on condoms and STIs/pregnancy, word for word, with the link.

## Sound

Synthesized with the engine's `SoundBus`, on by default with a visible toggle (sound the visitor turns on plays on an iPhone set to silent too): foil crinkle, the rip, a pump's puff, latex squeaks, the deflating squeal (pitch follows pressure), a «boing» per collision, water slosh. Every sound has an on-screen word («Rrrip», «Pfff», «Boing»), so nothing depends on hearing it.

## Accessibility and fallbacks

Real headings and copy in the DOM; every interaction has a keyboard path (Space to pump, Enter to let go, buttons for tearing and tying); reduced motion — no flight: the balloon deflates gently in place, the packets stand still; without WebGL, drawn SVG illustrations take over; a lost WebGL context falls back the same way and comes back.

## Build plan

1. **Engine first** (generic, in `veyra-core`; Abali's falling cap is the second user): light rigid-body physics with sub-steps and colliders — planes, boxes, and DOM elements as boxes in the pixel camera's space, re-measured on refresh; `SoundBus.voice()`, a continuous synthesized sound with live parameters; a press-and-hold input with its keyboard equivalent.
2. **Skeleton**: Vite + TypeScript + three.js + `@veyra/core` from the `release` branch; base `/durex/`; GitHub Pages workflow copied from Abali (engine stamp, dispatch, hourly check); `npm run verify` with Playwright; add `durex` to the engine's site dispatch.
3. **Loader and Zero gravity**: the foil packet (geometry, crinkles, artwork), instanced packets, the pointer field, the headline.
4. **Rip and Roll**: the tear, the torn corner as a rigid body, the unroll shader, the latex material.
5. **Pump and Let go**: the inflating profile, the gauge, the untied-balloon flight and its collisions with the page, «Tie it».
6. **Tested and Play safe**: the water-filled soft body, the rising balloons, the facts, the commission line.
7. **Polish**: sound, reduced motion, the no-WebGL drawings, quality tiers on every world (`setQuality` as the tier changes), `warmUp` for worlds built ahead of time, `quality.hold()` while building them, `stableHeight` for phones, `onRestore` for lost contexts; a responsive sweep (320 px phones to ultrawide); the share image; Case 002 on the studio site.

Budgets: first visit under ~700 KB transferred (three.js included), fonts subset to what is set, every world under 8 ms a frame at the high tier on a mid-range laptop and holding 60 fps at the low tier on a mid-range phone.

## Open questions for the owner

- Photographs of the packaging to sample colours and artwork from (which product lines: Invisible, Real Feel, others?).
- The headline: «Zero gravity. Zero worries.» or another.
- A Persian version later?

## Sources

- Durex UK — [What quality tests do Durex condoms go through?](https://www.durex.co.uk/pages/faqs/what-quality-tests-do-durex-condoms-go-through) · [Why Durex](https://durex.co.uk/pages/why-durex)
- Durex Nigeria — [Quality control](https://durex.com.ng/about-durex/quality-control)
- UNFPA — [Corrigendum to the WHO/UNFPA male latex condom specification (2013)](https://aa.unfpa.org/sites/default/files/resource-pdf/Corrigendum_April_16th_2013.pdf)
- Wikipedia — [Durex](https://en.wikipedia.org/wiki/Durex)

## Credits

Concept: [Veyra Studio](https://veyra-studio.github.io/) — commissions: [itsmetti@proton.me](mailto:itsmetti@proton.me).
