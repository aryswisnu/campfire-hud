import type { AgentRun } from '../types'
import { fit, GAUGE_CSS, gauge, modelName, shownPct, xml } from './desktop'
import { avatar, costumeColor, costumeOf, roleName, SPRITE_CSS } from './sprites'
import type { Mood } from './sprites'

const moodOf = (a: AgentRun): Mood => (a.status === 'running' ? 'focus' : a.status === 'done' ? 'happy' : 'dizzy')
const WARN_AT = 70
const WARN = '#F2A33A'
const isWarning = (a: AgentRun): boolean => a.status === 'failed' || (a.status === 'running' && ctxOf(a) >= WARN_AT)

const SANS = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"
const SERIF = "'New York','Iowan Old Style',Georgia,serif"

const PANE_CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#e4e2dc}.gr{fill:#f4f3ef}.ln{stroke:#e4e4e1}
${GAUGE_CSS}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#333230}.gr{fill:#262624}.ln{stroke:#333331}}
text{font-family:${SANS};font-variant-numeric:tabular-nums;white-space:pre}
.q{font-family:${SERIF}}
.fl{animation:bl .5s steps(1) infinite}.fl2{animation:bl .5s steps(1) infinite -.25s}@keyframes bl{50%{opacity:.2}}
@media (prefers-reduced-motion: reduce){.fl,.fl2{animation:none}}
</style>`

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${PANE_CSS}${SPRITE_CSS}${body}</svg>`

// USD per million tokens: input, output, cache read, cache write, as of 2026-10.
// The engine reports a subagent's tokens, not its cost, so the panel estimates it.
const PRICES: [RegExp, [number, number, number, number]][] = [
  [/fable/, [10, 50, 0.25, 12.5]],
  [/opus-5-5/, [4, 20, 0.2, 5]],
  [/opus/, [5, 25, 0.5, 6.25]],
  [/sonnet/, [2, 10, 0.2, 2.5]],
  [/haiku/, [1, 5, 0.1, 1.25]],
]

export type StepUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export const costOf = (model: string, u: StepUsage): number => {
  const [i, o, r, w] = PRICES.find(([re]) => re.test(model.toLowerCase()))?.[1] ?? [4, 20, 0.2, 5]
  return ((u.input_tokens || 0) * i + (u.output_tokens || 0) * o + (u.cache_read_input_tokens || 0) * r + (u.cache_creation_input_tokens || 0) * w) / 1e6
}

// An assumption: the panel cannot read a subagent's context window, so Haiku is 200K and every other model 1M.
export const windowOf = (model: string): number => (/haiku/i.test(model) ? 200_000 : 1_000_000)
export const ctxOf = (a: AgentRun): number => Math.min(100, Math.round((a.contextTokens / windowOf(a.model)) * 100))

export const fmtK = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`)
export const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`
export const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export const agentColor = (a: AgentRun): string => costumeColor(costumeOf(a.type))

/** Role names for the running agents, numbered when a role appears twice. */
export const namesOf = (running: AgentRun[]): Map<string, string> => {
  const count = new Map<string, number>()
  for (const a of running) count.set(costumeOf(a.type), (count.get(costumeOf(a.type)) ?? 0) + 1)
  const seen = new Map<string, number>()
  return new Map(
    [...running].reverse().map(a => {
      const c = costumeOf(a.type)
      seen.set(c, (seen.get(c) ?? 0) + 1)
      return [a.id, (count.get(c) ?? 0) > 1 ? `${roleName(c)} ${seen.get(c)}` : roleName(c)]
    }),
  )
}

type Totals = { cost: number; tokens: number; time: number }

export const totalsOf = (list: AgentRun[], at: number): Totals => ({
  cost: list.reduce((s, a) => s + (a.costUsd ?? 0), 0),
  tokens: list.reduce((s, a) => s + a.tokens, 0),
  time: list.length ? Math.max(...list.map(a => a.endedAt ?? Math.max(at, a.startedAt))) - Math.min(...list.map(a => a.startedAt)) : 0,
})

const elapsed = (a: AgentRun, at: number): string => fmtTime((a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt)
const meta = (a: AgentRun): string => (a.effort ? `${modelName(a.model)}  ${a.effort}` : modelName(a.model))

/** How big the campfire burns: out with nobody running, then small, medium and big. */
export const fireLevel = (running: number): 0 | 1 | 2 | 3 => (running === 0 ? 0 : running <= 2 ? 1 : running <= 4 ? 2 : 3)

const fire = (level: number, x: number, y: number): string => {
  const logs = `<rect x="-13" y="6" width="26" height="4" fill="#8A5A2B"/><rect x="-11" y="3" width="22" height="4" fill="#A8743F"/><rect x="-13" y="6" width="4" height="4" fill="#C08A4A"/><rect x="9" y="6" width="4" height="4" fill="#C08A4A"/>`
  if (level === 0) return `<g transform="translate(${x},${y})">${logs}<rect x="-3" y="1.5" width="2" height="2" fill="#6b6b68"/><rect x="1" y="2" width="2" height="1.5" fill="#6b6b68"/></g>`
  const s = level === 1 ? 0.6 : level === 2 ? 1.05 : 1.8
  const sides =
    level === 3 ? `<polygon class="fl2" points="-12,4 -7,-10 -2,4" fill="#E27B57"/><polygon class="fl2" points="2,4 7,-11 12,4" fill="#E27B57"/>` : ''
  return `<g transform="translate(${x},${y})"><ellipse cx="0" cy="8" rx="${18 * s + 10}" ry="${5 * s + 3}" fill="${WARN}" opacity="${0.06 + 0.04 * level}"/>${logs}
<g transform="scale(${s})"><g class="fl"><polygon points="-8,4 0,-18 8,4" fill="${WARN}"/><polygon points="-4,4 0,-9 4,4" fill="#F2D35A"/></g>${sides}</g></g>`
}

export const SCENE_H = 220
const RING_MAX = 8

/**
 * The party around a campfire: the running agents stand in a ring, nearer ones
 * bigger. With nobody running the fire is out and the finished agents sleep.
 */
export const sceneSvg = (W: number, running: AgentRun[], finished: AgentRun[], names: Map<string, string>): string => {
  const isAsleep = running.length === 0
  const all = isAsleep ? finished : running
  const party = all.slice(0, RING_MAX)
  const more = all.length - party.length
  const cx = W / 2
  const cy = 120
  const rx = Math.min(200, W / 2 - 52)
  const ry = 62
  const k = party.length
  const spots = party
    .map((a, i) => {
      const angle = k === 1 ? Math.PI * 0.75 : Math.PI / 2 + (i * 2 * Math.PI) / k + Math.PI / k
      return { a, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) }
    })
    .sort((p, q) => p.y - q.y)
  const camp = fire(fireLevel(running.length), cx, cy - 4)
  let body = ''
  let isFireDrawn = false
  for (const { a, x, y } of spots) {
    if (y > cy && !isFireDrawn) {
      body += camp
      isFireDrawn = true
    }
    const s = 1.35 + (0.5 * (y - (cy - ry))) / (2 * ry)
    const mood: Mood = isAsleep && a.status === 'done' ? 'sleep' : moodOf(a)
    const name = names.get(a.id) ?? roleName(costumeOf(a.type))
    body += avatar(x - 20 * s, y - 31.5 * s + (isAsleep ? 12 + 2 * s : 12), costumeOf(a.type), mood, !isAsleep, isWarning(a), s)
    body += `<text x="${x}" y="${y + 26}" font-size="11" font-weight="600" text-anchor="middle" fill="${agentColor(a)}"${isAsleep ? ' opacity=".6"' : ''}>${xml(name)}</text>`
  }
  if (!isFireDrawn) body += camp
  if (more > 0) body += `<text class="s" x="${W - 12}" y="22" font-size="12" text-anchor="end">+${more} more</text>`
  if (all.length === 0) body += `<text class="s" x="${cx}" y="${SCENE_H - 22}" font-size="12" text-anchor="middle">No agents yet. They gather here when Claude starts one.</text>`
  return svg(W, SCENE_H, `<rect class="gr" x="0" y="0" width="${W}" height="${SCENE_H}" rx="10"/>${body}`)
}

export const SUMMARY_H = 26

export const summarySvg = (W: number, running: number, finished: number, t: Totals): string =>
  svg(
    W,
    SUMMARY_H,
    `<text class="s" x="0" y="17" font-size="12">${running} running, ${finished} finished</text><text class="t" x="${W}" y="17" font-size="12" text-anchor="end">≈${fmtCost(t.cost)}   <tspan class="s">${fmtK(t.tokens)} tokens</tspan>   ${fmtTime(t.time)}</text>`,
  )

export const DETAIL_H = 98

/** The selected running agent, in full. */
export const detailSvg = (W: number, a: AgentRun, at: number, name: string, isLeft = false): string => {
  const color = agentColor(a)
  const ctx = ctxOf(a)
  const hot = ctx >= WARN_AT
  const win = windowOf(a.model) >= 1_000_000 ? '1M' : '200K'
  return svg(
    W,
    DETAIL_H,
    `<rect class="gr" x="0" y="0" width="${W}" height="${DETAIL_H - 4}" rx="8"/><rect x="0" y="0" width="3" height="${DETAIL_H - 4}" rx="1.5" fill="${color}"/>
<text x="14" y="20" font-size="12"><tspan fill="${color}" font-weight="600">${xml(name)}</tspan><tspan class="s">   ${xml(meta(a))}</tspan></text>
<text class="t q" x="14" y="41" font-size="15">${xml(fit(a.description || a.type, 14, W - 28))}</text>
${gauge(14, 49, W - 120, 9, shownPct(ctx, isLeft), hot ? WARN : color)}<text class="s" x="${W - 10}" y="57" font-size="11" text-anchor="end"${hot ? ` style="fill:${WARN}"` : ''}>${shownPct(ctx, isLeft)}% of ${win}${isLeft ? ' left' : ''}</text>
<text class="m" x="14" y="80" font-size="11.5">${xml(fit(a.lastTool || 'Starting', 11.5, W - 140))}</text><text class="t" x="${W - 10}" y="80" font-size="11.5" text-anchor="end">≈${fmtCost(a.costUsd ?? 0)}   ${elapsed(a, at)}</text>`,
  )
}

export const LINE_H = 32

/** Another running agent, in one line; its Open button sits beside it. */
export const lineSvg = (W: number, a: AgentRun, at: number, name: string, isLeft = false): string => {
  const color = agentColor(a)
  const ctx = ctxOf(a)
  const hot = ctx >= WARN_AT
  const nameW = name.length * 7 + 10
  return svg(
    W,
    LINE_H,
    `<rect x="0" y="8" width="3" height="16" rx="1.5" fill="${color}"/>
<text x="14" y="21" font-size="12.5" font-weight="600" fill="${color}">${xml(name)}</text>
<text class="t q" x="${14 + nameW}" y="21" font-size="13.5">${xml(fit(a.description || a.type, 13, W - nameW - (isLeft ? 110 : 80)))}</text>
<text x="${W}" y="21" font-size="11.5" text-anchor="end"><tspan class="s"${hot ? ` style="fill:${WARN}"` : ''}>${shownPct(ctx, isLeft)}%${isLeft ? ' left' : ''}</tspan><tspan class="s">   ${elapsed(a, at)}</tspan></text>
<line class="ln" x1="14" y1="${LINE_H - 0.5}" x2="${W}" y2="${LINE_H - 0.5}"/>`,
  )
}

export const DONE_H = 42

/** A finished agent: its Clawd, the task, and how it ended. */
export const doneSvg = (W: number, a: AgentRun, at: number): string => {
  const color = agentColor(a)
  const c = costumeOf(a.type)
  return svg(
    W,
    DONE_H,
    `${avatar(-2, 2, c, moodOf(a), false, isWarning(a), 1.05)}
<text class="t q" x="46" y="17" font-size="13.5">${xml(fit(a.description || a.type, 13, W - 150))}</text>
<text x="46" y="33" font-size="11"><tspan fill="${color}" font-weight="600">${roleName(c)}</tspan><tspan class="s">   ${xml(modelName(a.model))}${a.status === 'failed' ? '   failed' : ''}</tspan></text>
<text class="s" x="${W}" y="17" font-size="11.5" text-anchor="end">≈${fmtCost(a.costUsd ?? 0)}   ${elapsed(a, at)}</text>`,
  )
}
