// Records which engine release a build used, as dist/engine.json. The deploy
// workflow's hourly check compares it with veyra-core's `release` branch and
// rebuilds when they differ.
import { readFileSync, writeFileSync } from 'node:fs'

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const lock = read('../package-lock.json')
const engine = read('../node_modules/@veyra/core/package.json')
const resolved = lock.packages?.['node_modules/@veyra/core']?.resolved ?? ''
const stamp = {
  name: engine.name,
  version: engine.version,
  commit: /#([0-9a-f]{40})$/.exec(resolved)?.[1] ?? null,
  source: engine.gitHead ?? null,
  builtAt: new Date().toISOString(),
}
writeFileSync(new URL('../dist/engine.json', import.meta.url), `${JSON.stringify(stamp, null, 2)}\n`)
console.log(`dist/engine.json: ${stamp.name}@${stamp.version} (${stamp.commit?.slice(0, 7) ?? 'commit unknown'})`)
