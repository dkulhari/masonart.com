#!/usr/bin/env node
// Builds a blind A/B pair for a critic.
//
//   node scripts/pdp-blind.mjs --piece buy-panel --width 1440 --scroll 900
//
// Captures the reference and our page under identical conditions, writes them as A.png and
// B.png in a randomised order, and stashes which is which in key.json. The critic reads the
// two images and reports "A" or "B"; it must not read key.json. The caller maps the verdict
// back afterwards.
//
// Flags mirror pdp-shot.mjs: --width --height --scroll --full --clip --wait
// --clip takes two selectors separated by '::' when the two pages need different ones,
// e.g. --clip '.product__info::[data-testid="buy-panel"]' (reference first, ours second).

import { spawnSync } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { randomInt } from 'node:crypto'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const flag = name => argv.includes(`--${name}`)

const piece = arg('piece', 'page')
const dir = arg('dir', `.playwright-mcp/blind/${piece}`)
const clip = arg('clip')
const [refClip, oursClip] = clip ? clip.split('::') : [null, null]

const passthrough = []
for (const name of ['width', 'height', 'scroll', 'wait']) {
  const v = arg(name)
  if (v !== undefined) passthrough.push(`--${name}`, v)
}
if (flag('full')) passthrough.push('--full')

await rm(dir, { recursive: true, force: true })
await mkdir(dir, { recursive: true })

const shoot = (target, out, elClip) => {
  const args = ['scripts/pdp-shot.mjs', '--target', target, '--out', out, ...passthrough]
  if (elClip) args.push('--clip', elClip)
  const r = spawnSync('node', args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(`capture failed for ${target}:\n${r.stderr || r.stdout}`)
  }
  return out
}

// Coin flip decides which label the reference gets, so the critic cannot learn a convention
// across rounds.
const refIsA = randomInt(2) === 0
shoot('ref', `${dir}/${refIsA ? 'A' : 'B'}.png`, refClip || oursClip)
shoot('ours', `${dir}/${refIsA ? 'B' : 'A'}.png`, oursClip || refClip)

await writeFile(
  `${dir}/key.json`,
  JSON.stringify({ A: refIsA ? 'reference' : 'ours', B: refIsA ? 'ours' : 'reference' }, null, 2),
)

console.log(`${dir}/A.png`)
console.log(`${dir}/B.png`)
console.log('key written to key.json — do not show it to the critic')
