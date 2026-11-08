// Runs before `dev` and `build`: downloads the official cloud icons only when some are missing.
// Never fails the build: without icons the app shows emoji instead.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { PRODUCTS } from '../src/model/cloudIcons.ts'

const missing = (['aws', 'gcp'] as const).flatMap(c => PRODUCTS[c].filter(p => !existsSync(`public/icons/${c}/${p.key}.svg`)))
if (missing.length) {
  console.log(`cloud icons: ${missing.length} missing, downloading from AWS and Google (see THIRD_PARTY_NOTICES.md)…`)
  const r = spawnSync(process.execPath, ['scripts/fetch-icons.ts'], { stdio: 'inherit' })
  if (r.status !== 0) console.warn('cloud icons: download failed; continuing without them (emoji fallback). Retry with `npm run icons`.')
}
