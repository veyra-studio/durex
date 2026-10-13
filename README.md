# Durex — «Zero gravity.»

**Status: built — every chapter.** Veyra's second showcase: an English, art-directed campaign concept for **Durex Invisible**, made with the [Veyra](https://github.com/veyra-studio/veyra-core) engine. Live: <https://veyra-studio.github.io/durex/> · the models on their own, with every sound: <https://veyra-studio.github.io/durex/models.html>. The plan for all Veyra repositories lives in [veyra-core/docs/PLAN.md](https://github.com/veyra-studio/veyra-core/blob/main/docs/PLAN.md) (Phase 6).

```bash
npm install && npm run dev      # http://localhost:5173/durex/
npm run build && npm run verify # production build + checks (-- --gpu on the GPU)
```

> **Independent and unofficial.** A concept piece made to demonstrate Veyra — not commissioned by, affiliated with, or endorsed by Reckitt or Durex. Durex and its marks belong to their owners. (This line ships in the footer.)

## The idea

Everything floats. Foil packets drift in a dark studio like objects in orbit; one is torn open, the ring unrolls into a sheer, glossy sheath, you blow it up like a balloon — and let it go. It shoots round the page, squealing, off one side of the screen and back in at the other, bouncing off the page's own headlines, then drops, spent. The joke is the one every teenager knows; the point is the one the brand makes: strong enough to hold forty litres of air, thin enough to forget.

- **Language:** English, left to right.
- **Tone:** witty and luxurious. Product shots lit like Active Theory's and Santioni's dark, glossy worlds; copy in short, dry, double-meaning lines in Durex's own spirit. Playful, never explicit: no bodies, no acts, nothing a billboard couldn't carry.
- **Lines:** after a baby's cry, «Annoying, isn't it?» — «Some surprises can wait.» Then «Zero gravity. Zero worries.», «Tear here. Gently.», «Thin enough to forget.», «Go on, blow it up.», «Now, let go.», «Tested, tested, tested.»

## The film

| # | Chapter | What happens | Veyra at work |
| --- | --- | --- | --- |
| — | Loader | A packet's serrated edge lights up tooth by tooth; at 100% it tears. | `Preloader`, timelines |
| — | **Opening** | A gate — «This one has sound.» Play it, or Silent, please. A baby cries («WAAAAAH!» on screen too) and is cut short by the punchline, «Annoying, isn't it?»; Kevin MacLeod's «Smooth Lovin» comes in low, and the packets sweep in from the sides. | `SoundBus`, split text |
| 00 | **Zero gravity** | The packets float weightless, each a box in the physics world: they knock into each other and spin off, the pointer pushes them aside, and they keep out of the copy. One comes forward and turns right round. | three.js, instancing, `PhysicsWorld`, zones |
| 01 | **Rip** | It tears along a jagged line under the seal, right to left, the strip peeling back and tumbling away («Rrrip.»); the ring slides out of the opening as the packet drops back into the dark. | shader-clipped foil, scrubbed |
| 02 | **Roll** | The ring unrolls into the sheath, latex squeaking — «Thin enough to forget.» 180 mm of very nearly nothing. | the turned film rebuilt per frame |
| 03 | **Pump** *(the owner's idea)* | Hold the button or Space (scrolling fills it too): it swells into a round balloon, wobbling with each stroke. The gauge reads what the shape holds: 18 litres, «the international standard»; 40, «what Durex says a typical one holds» — «Still holding.» | `holdable`, volume integrated from the shape |
| 04 | **Let go** *(the owner's idea)* | «Let go»: the air rushing out drives it round the page, light and fast, tumbling, off one edge and back in at the other, bouncing off the headlines (they jolt), squealing as the pressure — and the pitch — drops; spent, it drops. Or «Tie it»: it stays, floating beside you for the rest of the film, to be batted about. | `PhysicsWorld`, `domColliders`, `SoundBus.voice` |
| 05 | **Tested** | A condom filled with water hangs by its rim; poke it (the button, or the drop itself) and it swings and wobbles, sloshing. Durex's testing, in their words. | springs, a water surface inside the film |
| 06 | **Play safe** | Balloons rise from below the screen to above it, one after another, a few tinted in the packaging's colours; the pointer parts them. The WHO's line on condoms, word for word. | instancing |

Everything visual is generated live, as in Abali: no product photos, no model files. The packet is a pillow of foil with crimped seams, a crinkle normal map and anisotropic highlights, its artwork drawn to canvas; the condom is a turned profile — a teat, the sheath, the rolled rim — rebuilt every frame as it unrolls, swells or holds water, in a thin-film latex material (Fresnel opacity, sheen, a touch of iridescence; no transmission, so phones can carry it). The packet's look — navy and silver, white ink, the name set in our own type — is our take on the line, not a copy of the box: no packaging photographs were used.

## Sound

The owner asked for natural sound: every effect is a public-domain (CC0) recording from Freesound, cut, levelled and compressed (`sounds/`), credited in the footer — the cry ([PickleJones](https://freesound.org/people/PickleJones/sounds/151085/)), the tear ([shutuplaika](https://freesound.org/people/shutuplaika/sounds/714213/)), foil ([Anthousai](https://freesound.org/people/Anthousai/sounds/337524/)), the pump ([otherthings](https://freesound.org/people/otherthings/sounds/65618/)), the air ([hareball101](https://freesound.org/people/hareball101/sounds/326756/), [xkeril](https://freesound.org/people/xkeril/sounds/760344/)), latex ([Huminaatio](https://freesound.org/people/Huminaatio/sounds/266979/)) and water ([XxBirdoxX](https://freesound.org/people/XxBirdoxX/sounds/52297/)). The music is «Smooth Lovin» by Kevin MacLeod ([incompetech.com](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700077)), licensed under [Creative Commons: By Attribution 4.0](https://creativecommons.org/licenses/by/4.0/): bars 17–32 of it, levelled and looped on the bar, and credited in the footer as the licence asks. («Careless Whisper» was the owner's first wish; it is copyrighted, so not without a licence.)

- Sound is asked for at the gate, so it plays on an iPhone set to silent too; the HUD toggle turns it off and on.
- The recordings travel as data inside scripts, never as audio files: download managers (IDM and the like) grab every .mp3 a page fetches. `npm run sounds` writes `sounds/*.mp3` into `src/sounds/*.ts` (generated, not committed; `dev`, `build` and `typecheck` run it).
- Short sounds are grains of a longer take, picked at random; the pump and the air are loops that cross-fade into themselves, and the air's pitch follows the pressure. The music is booked pass after pass on the audio clock, so its beat never slips: each pass fades in over the tenth of a second before its first downbeat while the one before fades out over the same moment of its last bar.
- Every sound has a word on screen («Rrrip.», «Squeak.», «Pfff.», «Pfffrrrrt!», «Slosh.»), so nothing depends on hearing it. Listen to each on the models page.

## Accessibility and fallbacks

Real headings and copy in the DOM; every interaction has a keyboard path (Space or Enter holds the pump; «Let go», «Tie it» and «Poke it» are buttons); reduced motion — no flight: let go, the balloon empties where it is, the packets stand still; without WebGL a drawn packet takes over. Weak devices get the light build (the tier is read after the layer, which lowers it on a software renderer), phones a canvas that holds still as the address bar moves, and lost contexts their light back.

## Facts the copy uses

Only well-sourced facts, attributed where they are the brand's own claims, each linked in the footer.

- Durex calls Invisible «Durex's thinnest condom ever» (Durex India, product page).
- A typical Durex condom holds about **40 litres** of air in the burst test; the international standard asks for **18** (Durex Nigeria and Durex UK). ISO 4074's minimum burst volume depends on width — 16, 18 or 22 litres — at a minimum burst pressure of 1.0 kPa (UNFPA's corrigendum to the WHO/UNFPA specification).
- The model's size: 180 mm long (± 5), 54 mm nominal width (a retail listing; some give 52–53 mm or 185 mm).
- **Every** Durex condom is tested electronically; samples from each batch are blown up with air, and filled with water and hung for a minute to show any leak — about two million water tests a month (Durex UK). If one sample fails, the whole batch — up to 432,000 condoms — doesn't leave the factory (Durex Nigeria).
- The WHO: «When used correctly and consistently, condoms offer one of the most effective methods of protection against STIs, including HIV.»

## Decided with the owner

- The product: **Durex Invisible**; English only.
- The opening: a baby's cry, then «Annoying, isn't it?», then music, then the packets.
- Natural recordings, not synthesized sound; «Smooth Lovin» (Kevin MacLeod, CC BY 4.0) in place of «Careless Whisper».
- A round balloon when blown up; let go, it leaves one side of the screen and comes back in at the other.

## Sources

- Durex India — [Durex Invisible 003](https://www.durexindia.com/products/durex-invisible-003-3-condoms)
- Durex UK — [What quality tests do Durex condoms go through?](https://www.durex.co.uk/pages/faqs/what-quality-tests-do-durex-condoms-go-through)
- Durex Nigeria — [Quality](https://www.durex.com.ng/pages/about-durex/quality-control)
- UNFPA — [Corrigendum to the WHO/UNFPA male latex condom specification (2013)](https://aa.unfpa.org/sites/default/files/resource-pdf/Corrigendum_April_16th_2013.pdf)
- WorldCondoms — [Durex Invisible Lubricated](https://worldcondoms.co.uk/products/durex-invisible-lubricated-condoms) (width and length)
- World Health Organization — [Sexually transmitted infections (STIs)](https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis))

## Credits

Concept: [Veyra Studio](https://veyra-studio.github.io/) — commissions: [itsmetti@proton.me](mailto:itsmetti@proton.me). Sounds: the Freesound recordists above (CC0); music: Kevin MacLeod (CC BY 4.0).
