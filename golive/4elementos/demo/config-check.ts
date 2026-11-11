import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function parseJsonc(text: string): unknown {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1')
  return JSON.parse(stripped)
}

export function demoConfigErrors(config: unknown): string[] {
  const errors: string[] = []
  if (!config || typeof config !== 'object') return ['config']
  const value = config as {
    name?: string
    workers_dev?: boolean
    routes?: unknown
    route?: unknown
    vars?: Record<string, string>
  }
  if (value.name !== 'elementos-demo') errors.push('name')
  if (value.workers_dev !== true) errors.push('workers_dev')
  if (value.routes || value.route) errors.push('custom route')
  const vars = value.vars ?? {}
  if (vars.DEMO_MODE !== 'true') errors.push('demo mode')
  if (vars.STRIPE_SECRET_KEY !== 'sk_test_REPLACE_ME') errors.push('stripe placeholder')
  if (vars.STRIPE_WEBHOOK_SECRET !== 'whsec_REPLACE_ME') errors.push('webhook placeholder')
  if (vars.TWILIO_DIRECT_CALLS !== 'false') errors.push('twilio direct must stay off')
  const blob = JSON.stringify(value)
  if (/sk_live_|rk_live_/.test(blob)) errors.push('live stripe key')
  for (const host of ['4elementos.com', 'vc.friskydev.com', 'nebu.quest', 'casabarravieja.com']) {
    if (blob.toLowerCase().includes(host)) errors.push(`forbidden host ${host}`)
  }
  return errors
}

function main() {
  const file = resolve(process.cwd(), 'golive/4elementos/demo/wrangler.jsonc')
  const errors = demoConfigErrors(parseJsonc(readFileSync(file, 'utf8')))
  if (errors.length) {
    console.error(`refusing demo config: ${errors.join(', ')}`)
    process.exit(1)
  }
}

const invoked = process.argv[1]?.endsWith('config-check.ts')
if (invoked) main()
