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

/**
 * `isHp` draws battery mode's HP bar: a rounded pill with no ticks and a bright
 * edge where the fill ends, so it never reads as the XP bar of used mode.
 */
export const gauge = (x: number, y: number, w: number, h: number, pct: number, color: string, ticks = 10, isHp = false): string => {
  const inner = w - 2
  const fill = (Math.max(0, Math.min(100, pct)) / 100) * inner
  const r = isHp ? (h - 2) / 2 : 1.2
  let out = `<rect class="gf" x="${x}" y="${y}" width="${w}" height="${h}" rx="${isHp ? h / 2 : 2}"/><rect class="gt" x="${x + 1}" y="${y + 1}" width="${inner}" height="${h - 2}" rx="${r}"/>`
  if (fill > 0)
    out += `<rect x="${x + 1}" y="${y + 1}" width="${fill.toFixed(1)}" height="${h - 2}" rx="${r}" fill="${shade(color)}"/><rect x="${x + 1}" y="${y + 1}" width="${fill.toFixed(1)}" height="${((h - 2) * 0.55).toFixed(1)}" rx="${r}" fill="${color}"/>
<rect x="${x + 2}" y="${y + 1.6}" width="${Math.max(0, fill - 2).toFixed(1)}" height="${Math.max(1, (h - 2) * 0.18).toFixed(1)}" fill="#fff" opacity=".35"/>`
  if (isHp && fill > 3) out += `<rect x="${(x + fill - 0.5).toFixed(1)}" y="${y + 1}" width="1.5" height="${h - 2}" fill="#fff" opacity=".85"/>`
  for (let i = 1; !isHp && i < ticks; i++) out += `<rect class="gf" x="${(x + 1 + (inner * i) / ticks - 0.5).toFixed(1)}" y="${y + 1}" width="1" height="${h - 2}" opacity=".55"/>`
  return out
}

// Battery mode's emblem in front of the context gauges: a pixel heart, 12 units wide.
const HEART_PX = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']
const heart = (x: number, y: number, size: number): string => {
  const u = size / 7
  return HEART_PX.flatMap((row, j) =>
    [...row].map((ch, i) => (ch === '#' ? `<rect x="${(x + i * u).toFixed(1)}" y="${(y + j * u).toFixed(1)}" width="${(u + 0.05).toFixed(2)}" height="${(u + 0.05).toFixed(2)}" fill="${STATUS.high}"/>` : '')),
  ).join('')
}
const HEART_W = 16

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

/** What a bar shows: the share used, or in battery mode the share left. */
export const shownPct = (used: number, isLeft: boolean): number => {
  const u = Math.max(0, Math.min(100, used))
  return isLeft ? 100 - u : u
}
export const pctText = (used: number, isLeft: boolean): string => `${Math.round(shownPct(used, isLeft))}%${isLeft ? ' left' : ''}`
// A token count's place on a bar; in battery mode the bar drains from the right, so the place mirrors.
const markX = (x: number, w: number, tokens: number, window: number, isLeft: boolean): number =>
  x + ((isLeft ? window - tokens : tokens) / window) * w

// Where auto-compact runs, as an amber marker; the label sits inside the gauge's width.
const compactMark = (x: number, y: number, w: number, h: number, c: ContextFigures, isLeft: boolean, label: boolean): string => {
  if (!c.compactAt || c.compactAt >= c.window) return ''
  const cx = markX(x, w, c.compactAt, c.window, isLeft)
  const anchor = cx > x + w - 40 ? 'end' : cx < x + 40 ? 'start' : 'middle'
  return `<rect x="${(cx - 1).toFixed(1)}" y="${y - 4}" width="2" height="${h + 7}" fill="${STATUS.moderate}"/>${label ? t(cx, y + h + 14, 'i', 10, 'auto-compact', ` text-anchor="${anchor}" style="fill:${STATUS.moderate}"`) : ''}`
}

// The context window as a gauge; a notch marks 200K on larger windows, where
// long-context pricing starts.
const contextGauge = (x0: number, y: number, w0: number, h: number, c: ContextFigures, color: string, isLeft: boolean): string => {
  const x = isLeft ? x0 + HEART_W : x0
  const w = isLeft ? w0 - HEART_W : w0
  const notch = c.window > 200_000 ? markX(x, w, 200_000, c.window, isLeft) : -1
  const compactX = c.compactAt ? markX(x, w, c.compactAt, c.window, isLeft) : -1
  // The 200K label gives way when the auto-compact label would overlap it.
  const notchLabel = notch > 0 && Math.abs(notch - compactX) > 70 ? t(notch, y + h + 14, 'm', 10, '200K', ' text-anchor="middle"') : ''
  return (
    (isLeft ? heart(x0, y + (h - 12 * (6 / 7)) / 2, 12) : '') +
    gauge(x, y, w, h, shownPct(c.percent, isLeft), color, 10, isLeft) +
    (notch > 0 ? `<rect class="m" x="${notch - 0.5}" y="${y - 4}" width="1" height="${h + 7}"/>${notchLabel}` : '') +
    compactMark(x, y, w, h, c, isLeft, true)
  )
}

/** `compactAt`: the token count where auto-compact runs; absent when it is off or unknown. */
type ContextFigures = { percent: number; tokens: number; window: number; compactAt?: number }

export const CONTEXT_H = 90

export const contextSvg = (W: number, c: ContextFigures, isLeft = false): string => {
  const lv = levelOf(c.percent)
  const win = c.window >= 1_000_000 ? `${c.window / 1_000_000}M` : `${Math.round(c.window / 1000)}K`
  const tokens = isLeft ? `${fmtTokens(Math.max(0, c.window - c.tokens))} of ${win} left` : `${fmtTokens(c.tokens)} of ${win}`
  return svg(
    W,
    CONTEXT_H,
    `${t(0, 15, 'm', 12, 'Context')}
${t(W, 15, 'i', 12, lv.word, ` text-anchor="end" style="fill:${lv.color}" font-weight="600"`)}
<text x="0" y="45" font-size="30" font-weight="600" class="i">${Math.round(shownPct(c.percent, isLeft))}<tspan font-size="16" class="m">%${isLeft ? ' left' : ''}</tspan></text>
${t(W, 45, 'm', 12, tokens, ' text-anchor="end"')}
${contextGauge(0, 58, W, 14, c, lv.color, isLeft)}`,
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

type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export const LIMITS_H = 30

export const limitsSvg = (W: number, limits: Limit[], isLeft = false, now = 0): string => {
  const gap = 16
  const each = (W - gap * (limits.length - 1)) / Math.max(1, limits.length)
  const body = limits
    .map((l, i) => {
      const x = i * (each + gap)
      const pct = Math.max(0, Math.min(100, l.percentUsed))
      const color = levelOf(pct).color
      const pctS = pctText(l.percentUsed, isLeft)
      const label = [limitName(l.kind), resetText(l, now)].filter(Boolean).join(' ')
      return `${t(x, 12, 'm', 11, fit(label, 11, each - pctS.length * 7 - 8))}${t(x + each, 12, 'i', 11, pctS, ' text-anchor="end"')}
${gauge(x, 19, each, 8, shownPct(pct, isLeft), color, 10, isLeft)}`
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

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** When a window resets, as a wall-clock time, so it never goes stale between renders. */
export const resetText = (l: Limit | undefined, now: number): string => {
  const ms = l?.resetsAt ? Date.parse(l.resetsAt) : NaN
  if (Number.isNaN(ms)) return ''
  return `↻${ms - now < 86_400_000 ? '' : DAYS[new Date(ms).getDay()] + ' '}${fmtClock(ms)}`
}

// Estimated width of 12px text, to lay the band out without measuring it; bold runs 8% wider.
const textW = (s: string, isBold = false): number =>
  [...s].reduce((w, ch) => w + (' :.,ilt|'.includes(ch) ? 3.5 : ch === '↻' ? 12 : '%MW—'.includes(ch) ? 11 : /[A-Z]/.test(ch) ? 8 : 7), 0) * (isBold ? 1.08 : 1)
const BAR_W = 44
const STRIP_MIN = 80

type BandPart = 'branch' | 'model' | 'strip' | 'bars' | 'word' | 'cost' | 'resets'
// The band drops parts in this order until it fits; the context share and both usage shares always stay.
const DROP_ORDER: BandPart[] = ['branch', 'model', 'strip', 'bars', 'word', 'cost', 'resets']

export const bandSvg = (W: number, model: string, c: ContextFigures, cost: number, branch: string, limits: Limit[], isLeft = false, now = 0): string => {
  const lv = levelOf(c.percent)
  const slots = BAND_LIMITS.map(([kind, label]) => {
    const l = limits.find(x => x.kind === kind)
    return { label, l, pct: l ? pctText(l.percentUsed, isLeft) : '—', reset: resetText(l, now) }
  })
  const head = pctText(c.percent, isLeft)
  const money = `$${cost.toFixed(2)}`
  const name = modelName(model)
  const br = branch ? fit(branch, 12, W * 0.25) : ''
  const on = new Set<BandPart>(DROP_ORDER)
  if (!br) on.delete('branch')

  const slotW = (s: (typeof slots)[number]): number =>
    textW(s.label) + 6 + (on.has('bars') ? BAR_W + 6 : 0) + textW(s.pct, true) + (on.has('resets') && s.reset ? 6 + textW(s.reset) : 0)
  const rightW = (): number => slots.reduce((sum, s) => sum + slotW(s), 0) + 16 * (slots.length - 1)
  const leftW = (): number =>
    (on.has('strip') ? STRIP_MIN + 10 : 0) +
    textW(head, true) +
    (on.has('word') ? 6 + textW(lv.word) : 0) +
    (on.has('cost') ? 16 + textW(money) : 0) +
    (on.has('model') ? 16 + textW(name) : 0) +
    (on.has('branch') ? 16 + textW(br) : 0)
  const need = (): number => leftW() + 16 + rightW()
  for (const part of DROP_ORDER) if (need() > W) on.delete(part)

  const stripW = on.has('strip') ? Math.min(160, STRIP_MIN + W - need()) : 0
  const sx = isLeft ? HEART_W : 0
  const sw = stripW - sx
  const strip = stripW
    ? (isLeft ? heart(0, 7, 12) : '') + gauge(sx, 6, sw, 12, shownPct(c.percent, isLeft), lv.color, 10, isLeft) + compactMark(sx, 6, sw, 12, c, isLeft, false)
    : ''
  const x0 = stripW ? stripW + 10 : 0
  const tail = [on.has('model') ? name : '', on.has('branch') ? br : ''].filter(Boolean)
  const left =
    `<text x="${x0}" y="16" font-size="12"><tspan class="i" font-weight="600">${head}</tspan>` +
    (on.has('word') ? `<tspan dx="6" style="fill:${lv.color}">${lv.word}</tspan>` : '') +
    (on.has('cost') ? `<tspan dx="16" class="i">${money}</tspan>` : '') +
    tail.map(p => `<tspan dx="16" class="m">${xml(p)}</tspan>`).join('') +
    '</text>'

  let x = W - rightW()
  const right = slots
    .map(s => {
      const pct = s.l ? Math.max(0, Math.min(100, s.l.percentUsed)) : 0
      let out = t(x, 16, 'm', 12, s.label)
      let px = x + textW(s.label) + 6
      if (on.has('bars')) {
        out += gauge(px, 8, BAR_W, 8, s.l ? shownPct(pct, isLeft) : 0, levelOf(pct).color, 5, isLeft)
        px += BAR_W + 6
      }
      out += t(px, 16, 'i', 12, s.pct, ' font-weight="600"')
      if (on.has('resets') && s.reset) out += t(px + textW(s.pct, true) + 6, 16, 'm', 12, s.reset)
      x += slotW(s) + 16
      return out
    })
    .join('')
  return svg(W, 24, `${strip}${left}${right}`)
}
