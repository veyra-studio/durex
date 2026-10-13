# Durex — working notes for Claude Code

Second showcase of the Veyra engine: an English, witty-luxurious campaign concept for Durex Invisible, «Zero gravity.». The concept, chapters, facts and build plan are in `README.md`; the plan for all Veyra repositories is `docs/PLAN.md` in [veyra-core](https://github.com/veyra-studio/veyra-core).

## Commands

```bash
npm install
npm run dev            # Vite dev server: /durex/ (the film) and /durex/models.html (the models)
npm run build          # tsc --noEmit + vite build (base /durex/)
npm run verify         # Playwright checks on the production build → verify-output/ (-- --gpu: Metal on a Mac, Direct3D on Windows)
npm run engine:update  # move to the newest engine release
VEYRA_CORE_SRC=../veyra-core npm run dev   # alias the engine to its source ($env:VEYRA_CORE_SRC='../veyra-core'; npm run dev in PowerShell)
```

Workflow: commit and push straight to `main` from the owner's machine (no pull requests).

The owner's npm installs through a mirror (`npm config get registry`): a lockfile written there points at it, and GitHub's runners can't reach it (`npm ci` hangs, then fails with «Exit handler never called!»). After an `npm install` that adds or updates packages, rewrite the `resolved` hosts to `https://registry.npmjs.org` before committing — npm maps them back to the mirror locally by itself. The deploy stops early if one slips through.

## Rules

- English, left to right. Witty and luxurious, never explicit: no bodies, no acts, nothing a billboard couldn't carry.
- Only sourced facts, attributed when they are the brand's claims, each linked in the footer (`.sources`). Keep the unofficial-concept disclaimer.
- Everything visual and audible is generated in code: no photos, no model files, no recordings. The packet's look is our own take on the line (no packaging photographs were used); nothing of the brand's is committed.
- Models are measured: the packet is 54 mm square (`src/gl/foil.ts`), the condom 180 mm long and 54 mm in nominal width (`src/gl/condom.ts`). Change dimensions only against a source.
- The condom's volume is integrated from its shape: anything showing litres reads `condom.volume`, never an invented curve.
- The latex material (`src/gl/latex.ts`) is premultiplied: reflections add, the film's own light scales with how much film the eye looks through; a roll is many layers (`layers`, `satin`). Creases fade as film stretches and when finer than a pixel.
- Packets in the cloud share one set of geometry and materials (`createPacketParts`): instanced, plus the featured packet.
- Words first: packets keep out of the copy on screen. Each chapter's copy is a zone (`world.state.clear`), measured from layout boxes on `stage.onRefresh` (never per frame), as strong as the copy is present; copy over the canvas also carries a dark text-shadow for the moments a pushed packet drifts behind it. New copy over the canvas gets a zone too.
- Weak devices: loading runs under `stage.quality.hold(...)`; read the tier only after the layer exists (on a software renderer `threeLayer` lowers the stage's quality as it is made); the cloud's size follows the tier, and its packets draw a coarser mesh than the featured one (`smallFront`/`smallBack`); the canvas keeps the large viewport's height (`stableHeight`); lost contexts rebuild the environment (`onRestore`).
- The opening asks first (`.gate`): sound turned on there is asked for, so it plays on a silent iPhone too. Without sound, the cry is captioned («WAAAAAH!») — nothing depends on hearing it.
- Check after visual changes: `npm run verify`, and inspect the models on `/durex/models.html` (`__models.look(dir, distance, 'packet' | 'condom')` in the console for close looks).
