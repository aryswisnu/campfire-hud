import type { Repo, Tokens } from '../types'

// Desktop drawings: one SVG per block, themed by the page's color scheme.

// Gem colours, from emerald to crimson as a bar fills.
export const STATUS = {
  good: '#3FBF7F',
  ok: '#E8C547',
  moderate: '#E8913A',
  high: '#D9434B',
  critical: '#B0243A',
}
const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"

// A framed RPG gauge: dark frame, inset track, the fill with a lit top and a
// shine, and a tick every 10%.
export const GAUGE_CSS = `.gf{fill:#3B2F27}.gt{fill:#E9E3D8}
@media (prefers-color-scheme: dark){.gf{fill:#14100D}.gt{fill:#2B231E}}`

const shade = (hex: string): string =>
  '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.7).toString(16).padStart(2, '0')).join('')

export const gauge = (x: number, y: number, w: number, h: number, pct: number, color: string, ticks = 10): string => {
  const inner = w - 2
  const fill = (Math.max(0, Math.min(100, pct)) / 100) * inner
  let out = `<rect class="gf" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/><rect class="gt" x="${x + 1}" y="${y + 1}" width="${inner}" height="${h - 2}" rx="1.2"/>`
  if (fill > 0)
    out += `<rect x="${x + 1}" y="${y + 1}" width="${fill.toFixed(1)}" height="${h - 2}" rx="1.2" fill="${shade(color)}"/><rect x="${x + 1}" y="${y + 1}" width="${fill.toFixed(1)}" height="${((h - 2) * 0.55).toFixed(1)}" rx="1.2" fill="${color}"/>
<rect x="${x + 2}" y="${y + 1.6}" width="${Math.max(0, fill - 2).toFixed(1)}" height="${Math.max(1, (h - 2) * 0.18).toFixed(1)}" fill="#fff" opacity=".35"/>`
  for (let i = 1; i < ticks; i++) out += `<rect class="gf" x="${(x + 1 + (inner * i) / ticks - 0.5).toFixed(1)}" y="${y + 1}" width="1" height="${h - 2}" opacity=".55"/>`
  return out
}

const CSS = `<style>
.i{fill:#1E2023}.m{fill:#7A7E85}${GAUGE_CSS}
@media (prefers-color-scheme: dark){.i{fill:#E6E4DF}.m{fill:#8C9097}}
text{font-family:${FONT};font-variant-numeric:tabular-nums;white-space:pre}
</style>`

type Level = { word: string; color: string }

export const levelOf = (pct: number): Level =>
  pct >= 95
    ? { word: 'Critical', color: STATUS.critical }
    : pct >= 85
      ? { word: 'High', color: STATUS.high }
      : pct >= 70
        ? { word: 'Moderate', color: STATUS.moderate }
        : pct >= 50
          ? { word: 'Filling', color: STATUS.ok }
          : { word: 'Good', color: STATUS.good }

export const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const fit = (s: string, size: number, width: number): string => {
  const max = Math.max(4, Math.floor(width / (size * 0.56)))
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${CSS}${body}</svg>`

const t = (x: number, y: number, cls: string, size: number, text: string, extra = ''): string =>
  `<text class="${cls}" x="${x}" y="${y}" font-size="${size}"${extra}>${xml(text)}</text>`

export const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : `${Math.round(n)}`

export const fmtDuration = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${m}m` : m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

export const fmtClock = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const modelName = (id: string): string => {
  const m = /(fable|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  if (!m) return id.replace(/^claude-/, '') || 'Unknown model'
  const [, family = '', major = '', minor] = m
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

export const limitName = (kind: string): string =>
  kind === 'five_hour' ? '5-hour limit' : kind === 'seven_day' ? 'Weekly limit' : kind === 'spend_limit' ? 'Spend limit' : kind.replace(/_/g, ' ')

// The context window as a gauge; a notch marks 200K on larger windows, where
// long-context pricing starts.
// Where auto-compact runs, as an amber marker; the label sits inside the gauge's width.
const compactMark = (x: number, y: number, w: number, h: number, compactAt: number | undefined, window: number, label: boolean): string => {
  if (!compactAt || compactAt >= window) return ''
  const cx = x + (compactAt / window) * w
  const anchor = cx > x + w - 40 ? 'end' : cx < x + 40 ? 'start' : 'middle'
  return `<rect x="${cx - 1}" y="${y - 4}" width="2" height="${h + 7}" fill="${STATUS.moderate}"/>${label ? t(cx, y + h + 14, 'i', 10, 'auto-compact', ` text-anchor="${anchor}" style="fill:${STATUS.moderate}"`) : ''}`
}

const contextGauge = (x: number, y: number, w: number, h: number, c: ContextFigures, color: string): string => {
  const notch = c.window > 200_000 ? x + (200_000 / c.window) * w : -1
  const compactX = c.compactAt ? x + (c.compactAt / c.window) * w : -1
  // The 200K label gives way when the auto-compact label would overlap it.
  const notchLabel = notch > 0 && Math.abs(notch - compactX) > 70 ? t(notch, y + h + 14, 'm', 10, '200K', ' text-anchor="middle"') : ''
  return (
    gauge(x, y, w, h, c.percent, color) +
    (notch > 0 ? `<rect class="m" x="${notch - 0.5}" y="${y - 4}" width="1" height="${h + 7}"/>${notchLabel}` : '') +
    compactMark(x, y, w, h, c.compactAt, c.window, true)
  )
}

/** `compactAt`: the token count where auto-compact runs; absent when it is off or unknown. */
type ContextFigures = { percent: number; tokens: number; window: number; compactAt?: number }

export const CONTEXT_H = 90

export const contextSvg = (W: number, c: ContextFigures): string => {
  const lv = levelOf(c.percent)
  const win = c.window >= 1_000_000 ? `${c.window / 1_000_000}M` : `${Math.round(c.window / 1000)}K`
  return svg(
    W,
    CONTEXT_H,
    `${t(0, 15, 'm', 12, 'Context')}
${t(W, 15, 'i', 12, lv.word, ` text-anchor="end" style="fill:${lv.color}" font-weight="600"`)}
<text x="0" y="45" font-size="30" font-weight="600" class="i">${Math.round(c.percent)}<tspan font-size="16" class="m">%</tspan></text>
${t(W, 45, 'm', 12, `${fmtTokens(c.tokens)} of ${win}`, ' text-anchor="end"')}
${contextGauge(0, 58, W, 14, c, lv.color)}`,
  )
}

export const statsSvg = (W: number, cost: number, elapsedMs: number, tk: Tokens): string => {
  const col = W / 3
  const fig = (x: number, value: string, label: string) =>
    `${t(x, 20, 'i', 17, value, ' font-weight="600"')}${t(x, 38, 'm', 11, label)}`
  return svg(
    W,
    46,
    `${fig(0, `$${cost.toFixed(2)}`, 'Spent')}${fig(col, fmtDuration(elapsedMs), 'Elapsed')}${fig(col * 2, `${fmtTokens(tk.input)} / ${fmtTokens(tk.output)}`, 'Tokens in / out')}`,
  )
}

type Limit = { kind: string; percentUsed: number }

export const LIMITS_H = 30

export const limitsSvg = (W: number, limits: Limit[]): string => {
  const gap = 16
  const each = (W - gap * (limits.length - 1)) / Math.max(1, limits.length)
  const body = limits
    .map((l, i) => {
      const x = i * (each + gap)
      const pct = Math.max(0, Math.min(100, l.percentUsed))
      const color = levelOf(pct).color
      return `${t(x, 12, 'm', 11, limitName(l.kind))}${t(x + each, 12, 'i', 11, `${Math.round(l.percentUsed)}%`, ' text-anchor="end"')}
${gauge(x, 19, each, 8, pct, color)}`
    })
    .join('')
  return svg(W, LIMITS_H, body)
}

export const repoSvg = (W: number, model: string, r: Repo | null, at: number): string => {
  const head = `${t(0, 16, 'i', 13, modelName(model), ' font-weight="600"')}${t(W, 16, 'm', 12, fmtClock(at), ' text-anchor="end"')}`
  if (!r) return svg(W, 42, `${head}${t(0, 36, 'm', 12, 'No git repository in this folder')}`)

  const parts: [string, string][] = []
  if (r.staged) parts.push([`${r.staged} staged`, STATUS.good])
  if (r.modified) parts.push([`${r.modified} modified`, STATUS.moderate])
  if (r.untracked) parts.push([`${r.untracked} new`, ''])
  if (r.added || r.removed) parts.push([`+${r.added} −${r.removed}`, ''])
  const status = parts.length
    ? parts.map(([s, c]) => `<tspan dx="10"${c ? ` style="fill:${c}"` : ' class="m"'}>${xml(s)}</tspan>`).join('')
    : `<tspan dx="10" class="m">clean</tspan>`
  return svg(
    W,
    42,
    `${head}<text x="0" y="36" font-size="12"><tspan class="i">${xml(fit(r.branch || 'detached', 12, W * 0.4))}</tspan>${status}</text>`,
  )
}

// The two usage windows the band always shows, a dash until the API has reported one.
export const BAND_LIMITS: [string, string][] = [
  ['five_hour', '5h'],
  ['seven_day', 'Week'],
]

const limitSlot = (x: number, label: string, l: Limit | undefined): string => {
  const barW = 44
  const pct = l ? Math.max(0, Math.min(100, l.percentUsed)) : 0
  return `${t(x, 16, 'm', 12, label)}${gauge(x + 38, 8, barW, 8, pct, levelOf(pct).color, 5)}${t(x + 38 + barW + 6, 16, 'i', 12, l ? `${Math.round(l.percentUsed)}%` : '—', ' font-weight="600"')}`
}

export const bandSvg = (W: number, model: string, c: ContextFigures, cost: number, branch: string, limits: Limit[]): string => {
  const lv = levelOf(c.percent)
  // The strip gives way to the usage slots and the head figures on a narrow band.
  const room = W - 130 * BAND_LIMITS.length - 200
  const stripW = room >= 40 ? Math.min(160, room) : 0
  const strip = stripW > 0 ? gauge(0, 6, stripW, 12, c.percent, lv.color) + compactMark(0, 6, stripW, 12, c.compactAt, c.window, false) : ''
  const x0 = stripW ? stripW + 10 : 0
  const SLOT = 130
  const slotsX = W - SLOT * BAND_LIMITS.length
  const slots = BAND_LIMITS.map(([kind, label], i) => limitSlot(slotsX + SLOT * i, label, limits.find(l => l.kind === kind))).join('')

  // Optional parts drop from the end until the left side clears the usage slots.
  const head = `<tspan class="i" font-weight="600">${Math.round(c.percent)}%</tspan><tspan dx="6" style="fill:${lv.color}">${lv.word}</tspan><tspan dx="16" class="i">$${cost.toFixed(2)}</tspan>`
  const headChars = `${Math.round(c.percent)}% ${lv.word} $${cost.toFixed(2)}`.length
  const optional = [modelName(model), branch ? fit(branch, 12, W * 0.25) : ''].filter(Boolean)
  const widthOf = (parts: string[]) => (headChars + parts.join('').length) * 7 + 22 + parts.length * 16
  while (optional.length && x0 + widthOf(optional) + 16 > slotsX) optional.pop()
  const tail = optional.map(p => `<tspan dx="16" class="m">${xml(p)}</tspan>`).join('')
  return svg(W, 24, `${strip}<text x="${x0}" y="16" font-size="12">${head}${tail}</text>${slots}`)
}
