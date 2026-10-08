import { atom, read, update } from 'claude-code'
import type { ElementConstructor, EngineInterface, Register, TextProps } from 'claude-code'

import type { AgentRun, AgentStatus, Panel, Repo, Tokens } from '../types'
import { costumeOf, roleName } from './sprites'
import {
  agentColor,
  costOf,
  type StepUsage,
  ctxOf,
  DETAIL_H,
  detailSvg,
  DONE_H,
  doneSvg,
  fmtCost,
  fmtK,
  fmtTime,
  LINE_H,
  lineSvg,
  namesOf,
  SCENE_H,
  sceneSvg,
  SUMMARY_H,
  summarySvg,
  totalsOf,
} from './agents'
import {
  BAND_LIMITS,
  bandSvg,
  CONTEXT_H,
  contextSvg,
  fmtClock,
  fmtDuration,
  fmtTokens,
  levelOf,
  limitName,
  LIMITS_H,
  limitsSvg,
  modelName,
  pctText,
  repoSvg,
  shownPct,
  statsSvg,
  STATUS,
} from './desktop'

const agents = atom({ plugin: 'campfire-hud', key: 'agents' } as const, [])
const tokens = atom({ plugin: 'campfire-hud', key: 'tokens' } as const, { input: 0, output: 0 })
const repo = atom({ plugin: 'campfire-hud', key: 'repo' } as const, null)
const now = atom({ plugin: 'campfire-hud', key: 'now' } as const, 0)
const compactAt = atom({ plugin: 'campfire-hud', key: 'compactAt' } as const, null)
const panel = atom({ plugin: 'campfire-hud', key: 'panel' } as const, { isDoneCollapsed: false })

const PANE = 'campfire-hud'
const TITLE = 'Details'

const inputOf = (u: StepUsage): number =>
  (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)

// The terminal's framed RPG gauge: solid blocks in the gem colour on a dim track, between frame edges.
// `markPct` puts an amber ┃ where auto-compact runs; `isHp` puts battery mode's ♥ in front.
const termGauge = (Text: ElementConstructor<TextProps>, pct: number, width: number, color: string, markPct?: number, isHp = false) => {
  const lit = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width)
  const mark = markPct !== undefined && markPct < 100 ? Math.min(width - 1, Math.round((markPct / 100) * width)) : -1
  const cells = (from: number, to: number, ch: string) => ch.repeat(Math.max(0, to - from))
  const fill = mark >= 0 && mark < lit ? [cells(0, mark, '█'), cells(mark + 1, lit, '█')] : [cells(0, lit, '█'), '']
  const track = mark >= lit ? [cells(lit, mark, '░'), cells(mark + 1, width, '░')] : [cells(lit, width, '░'), '']
  const marker = mark >= 0 ? <Text color={STATUS.moderate}>┃</Text> : ''
  return (
    <Text>
      {isHp ? <Text color={STATUS.high}>♥</Text> : <Text dimColor>▕</Text>}
      <Text color={color}>{fill[0]}</Text>
      {mark >= 0 && mark < lit && marker}
      <Text color={color}>{fill[1]}</Text>
      <Text dimColor>{track[0]}</Text>
      {mark >= lit && marker}
      <Text dimColor>{track[1]}</Text>
      <Text dimColor>▏</Text>
    </Text>
  )
}

// What a subagent's tool call is aimed at, for its "now doing" line.
const targetOf = (input: Record<string, unknown>): string => {
  const raw = input.file_path ?? input.path ?? input.pattern ?? input.command ?? input.url ?? input.description ?? ''
  const text = String(raw).split('\n')[0] ?? ''
  return text.split('/').slice(-2).join('/')
}

export const parseStatus = (porcelain: string): Omit<Repo, 'added' | 'removed'> => {
  const lines = porcelain.split('\n').filter(Boolean)
  const head = lines[0]?.startsWith('## ') ? (lines.shift() ?? '') : ''
  const branch = head.slice(3).split('...')[0]?.replace(/^No commits yet on /, '') ?? ''
  let staged = 0
  let modified = 0
  let untracked = 0
  for (const l of lines) {
    if (l.startsWith('??')) untracked += 1
    else {
      if (l[0] !== ' ') staged += 1
      if (l[1] !== ' ') modified += 1
    }
  }
  return { branch, staged, modified, untracked }
}

export const parseShortstat = (s: string): { added: number; removed: number } => ({
  added: Number(/(\d+) insertion/.exec(s)?.[1] ?? 0),
  removed: Number(/(\d+) deletion/.exec(s)?.[1] ?? 0),
})

async function refreshRepo($: EngineInterface): Promise<void> {
  const cwd = await $.session.cwd()
  const status = await $.process.run(['git', 'status', '--porcelain=v1', '--branch'], { cwd, timeoutMs: 5000 }).catch(() => null)
  if (!status || status.exitCode !== 0) {
    await update($, repo, () => null)
    return
  }
  const diff = await $.process.run(['git', 'diff', '--shortstat', 'HEAD'], { cwd, timeoutMs: 5000 }).catch(() => null)
  const next: Repo = { ...parseStatus(status.stdout), ...parseShortstat(diff?.stdout ?? '') }
  await update($, repo, () => next)
}

// The summary breakdown is estimated locally and sends no API request.
async function refreshCompact($: EngineInterface): Promise<void> {
  const b = (await $.session.usage({ breakdown: 'summary' }).catch(() => null))?.context.breakdown
  const at = b?.isAutoCompactEnabled && b.autoCompactThreshold ? b.autoCompactThreshold : null
  await update($, compactAt, () => at)
}

// Battery mode is saved across sessions.
const MODE_KEY = 'gaugeMode'

async function setLeft($: EngineInterface, isLeft: boolean): Promise<void> {
  await update($, panel, v => ({ ...v, isLeft }))
  await $.store.set(MODE_KEY, isLeft ? 'left' : 'used')
}

async function togglePane($: EngineInterface): Promise<boolean> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) {
    await $.ui.close({ id: PANE })
    return false
  }
  await $.ui.open({ id: PANE, title: TITLE })
  return true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'hud', description: 'Show or hide the session pane; /hud left or /hud used switches every bar' })
    if ((await $.store.get(MODE_KEY).catch(() => undefined)) === 'left') await update($, panel, v => ({ ...v, isLeft: true }))
    void $.ui.open({ id: PANE, title: TITLE })
    void refreshRepo($)
    void refreshCompact($)

    let tick = 0
    $.clock.every(1000, () => {
      void (async () => {
        tick += 1
        const list = await read($, agents)
        // Redraw every second while agents run, else every 15 s for the clock.
        if (list.some(a => a.status === 'running') || tick % 15 === 0) {
          const at = await $.clock.now()
          await update($, now, () => at)
        }
        if (tick % 5 === 0) await refreshRepo($)
        if (tick % 30 === 0) await refreshCompact($)
      })()
    })
    return started
  })

  on('command.run', { command: 'hud' }, async ($, e) => {
    const mode = e.args.trim().toLowerCase()
    if (mode === 'left' || mode === 'used') {
      await setLeft($, mode === 'left')
      return { text: mode === 'left' ? 'The bars now show what is left.' : 'The bars now show what is used.' }
    }
    return { text: (await togglePane($)) ? 'Details pane opened.' : 'Details pane closed.' }
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const usage = result.usage
    if (!usage) return result

    if (!e.agentId) {
      await update($, tokens, t => ({ input: t.input + inputOf(usage), output: t.output + (usage.output_tokens || 0) }))
      return result
    }
    await update($, agents, list =>
      list.map(a =>
        a.id !== e.agentId
          ? a
          : {
              ...a,
              model: usage.model || e.model,
              effort: typeof e.effort === 'string' ? e.effort : a.effort,
              costUsd: (a.costUsd ?? 0) + costOf(usage.model || e.model, usage),
              contextTokens: inputOf(usage) + (usage.output_tokens || 0),
              tokens: a.tokens + inputOf(usage) + (usage.output_tokens || 0),
            },
      ),
    )
    return result
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined) return started

    const at = await $.clock.now()
    const run: AgentRun = {
      id: started.agentId ?? e.tool_use_id,
      type: e.subagentType,
      description: e.description,
      model: started.model,
      status: 'running',
      startedAt: at,
      contextTokens: 0,
      tokens: 0,
      lastTool: '',
      costUsd: 0,
    }
    await update($, agents, list => [...list.filter(a => a.id !== run.id), run].slice(-50))
    await update($, now, () => at)
    if (!(await $.ui.panes()).some(p => p.id === PANE)) void $.ui.open({ id: PANE, title: TITLE })
    return started
  })

  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const target = targetOf(e as unknown as Record<string, unknown>)
      const label = target ? `${String(e.tool)}  ${target}` : String(e.tool)
      await update($, agents, list => list.map(a => (a.id === agentId ? { ...a, lastTool: label } : a)))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const at = await $.clock.now()
      const status: AgentStatus = e.reason === 'answer' ? 'done' : 'failed'
      await update($, agents, list => list.map(a => (a.id === agentId ? { ...a, status, endedAt: at } : a)))
      await update($, now, () => at)
    } else {
      void refreshRepo($)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const usage = await $.session.usage()
    const model = await $.session.model()
    const r: Repo | null = await read($, repo)
    const list = await read($, agents)
    const pct = usage.context.percent ?? 0
    const compact = (await read($, compactAt)) ?? undefined
    const { isLeft = false } = await read($, panel)
    const compactPct = compact ? shownPct((compact / usage.context.window) * 100, isLeft) : undefined
    const lv = levelOf(pct)
    const cost = usage.cost?.usd ?? 0
    const running = list.filter(a => a.status === 'running').length
    const bandLimits = BAND_LIMITS.map(([kind, label]) => {
      const l = usage.rateLimits.find(x => x.kind === kind)
      return `${label} ${l ? pctText(l.percentUsed, isLeft) : '—'}`
    }).join('  ')
    const label = running ? `${running} running` : list.length ? `${list.length} subagents` : 'Details'
    const toggle = (
      <Button
        key="hud-toggle"
        plain
        label={label}
        onPress={() => void togglePane($)}
      />
    )

    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 100) * 8 - 140))
      return (
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Svg
            source={bandSvg(W, model, { percent: pct, tokens: usage.context.tokens ?? 0, window: usage.context.window, compactAt: compact }, cost, r?.branch ?? '', usage.rateLimits, isLeft)}
            alt={`Context ${pctText(pct, isLeft)}, ${lv.word}. $${cost.toFixed(2)} spent. ${bandLimits}`}
            width={W}
            height={24}
          />
          {toggle}
        </Box>
      )
    }

    const cols = e.props.bodyColumns || 80
    const width = Math.max(6, Math.min(20, cols - 60))
    const head = `${pctText(pct, isLeft)} ${lv.word}`
    const money = `$${cost.toFixed(2)}`
    const branch = r && r.branch !== '' ? r.branch.slice(0, 24) : ''
    // Parts that do not fit drop instead of wrapping, the branch first, then the model, the limits, the cost.
    const optional = [money, bandLimits, modelName(model), branch].filter(Boolean)
    const sizeOf = (parts: string[]) => width + 3 + head.length + label.length + parts.reduce((n, p) => n + p.length + 2, 2)
    while (optional.length && sizeOf(optional) > cols) optional.pop()
    const shows = (part: string) => part !== '' && optional.includes(part)
    return (
      <Box flexDirection="row" gap={2}>
        <Text>
          {termGauge(Text, shownPct(pct, isLeft), width, lv.color, compactPct, isLeft)} <Text bold>{pctText(pct, isLeft)}</Text> <Text color={lv.color}>{lv.word}</Text>
        </Text>
        {shows(money) && <Text>{money}</Text>}
        {shows(modelName(model)) && <Text dimColor>{modelName(model)}</Text>}
        {shows(branch) && <Text dimColor>{branch}</Text>}
        {shows(bandLimits) && <Text dimColor>{bandLimits}</Text>}
        {toggle}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const usage = await $.session.usage()
    const model = await $.session.model()
    const t: Tokens = await read($, tokens)
    const r: Repo | null = await read($, repo)
    const list = await read($, agents)
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt), usage.startedAt)

    const ctx = { percent: usage.context.percent ?? 0, tokens: usage.context.tokens ?? 0, window: usage.context.window, compactAt: (await read($, compactAt)) ?? undefined }
    const cost = usage.cost?.usd ?? 0
    const lv = levelOf(ctx.percent)
    const p: Panel = await read($, panel)
    const isLeft = p.isLeft ?? false
    const modeToggle = (
      <Box key="mode" flexDirection="row" justifyContent="flex-end">
        <Button key="gauge-mode" plain dimColor label={isLeft ? '✦ Show used' : '♥ Show left'} onPress={() => setLeft($, !isLeft)} />
      </Box>
    )
    const running = list.filter(a => a.status === 'running').reverse()
    const finished = list.filter(a => a.status !== 'running').reverse().slice(0, 12)
    const totals = totalsOf(list, at)
    const names = namesOf(running)
    const nameOf = (a: AgentRun): string => names.get(a.id) ?? roleName(costumeOf(a.type))
    const selected = running.find(a => a.id === p.selectedId) ?? running[0]
    const summary = `${running.length} running, ${finished.length} finished`
    const finishedHeader = finished.length > 0 && (
      <Box key="finished" flexDirection="row" justifyContent="space-between">
        <Text>
          <Text bold>Finished</Text>
          <Text dimColor>  {finished.length}</Text>
        </Text>
        <Button
          key="done"
          plain
          dimColor
          label={p.isDoneCollapsed ? 'Show' : 'Hide'}
          onPress={() => update($, panel, v => ({ ...v, isDoneCollapsed: !v.isDoneCollapsed }))}
        />
      </Box>
    )

    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 46) * 8 - 8))
      return (
        <Box flexDirection="column" gap={2}>
          {modeToggle}
          <Svg source={contextSvg(W, ctx, isLeft)} alt={`Context ${pctText(ctx.percent, isLeft)}${isLeft ? '' : ' used'}, ${lv.word}`} width={W} height={CONTEXT_H} />
          <Svg source={statsSvg(W, cost, at - usage.startedAt, t)} alt={`$${cost.toFixed(2)} spent, ${fmtDuration(at - usage.startedAt)} elapsed`} width={W} height={46} />
          {usage.rateLimits.length > 0 && (
            <Svg
              source={limitsSvg(W, usage.rateLimits, isLeft)}
              alt={usage.rateLimits.map(l => `${limitName(l.kind)} ${Math.round(l.percentUsed)}%`).join(', ')}
              width={W}
              height={LIMITS_H}
            />
          )}
          <Svg source={repoSvg(W, model, r, at)} alt={r ? `${modelName(model)} on ${r.branch}` : modelName(model)} width={W} height={42} />
          <Svg
            source={sceneSvg(W, running, finished, names)}
            alt={list.length === 0 ? 'No agents yet' : running.length ? `${running.map(nameOf).join(', ')} at the campfire` : 'The party is resting. Every agent has finished.'}
            width={W}
            height={SCENE_H}
          />
          {list.length > 0 && (
            <Box flexDirection="column">
              <Svg source={summarySvg(W, running.length, finished.length, totals)} alt={`${summary}, ≈${fmtCost(totals.cost)}`} width={W} height={SUMMARY_H} />
              {running.map(a =>
                a === selected ? (
                  <Svg
                    key={`detail-${a.id}`}
                    source={detailSvg(W, a, at, nameOf(a), isLeft)}
                    alt={`${nameOf(a)}: ${a.description}, ${ctxOf(a)}% context, ${a.lastTool}`}
                    width={W}
                    height={DETAIL_H}
                  />
                ) : (
                  <Box key={a.id} flexDirection="row" alignItems="center" gap={1}>
                    <Svg source={lineSvg(W - 56, a, at, nameOf(a), isLeft)} alt={`${nameOf(a)}: ${a.description}, ${ctxOf(a)}% context`} width={W - 56} height={LINE_H} />
                    <Button key={`open-${a.id}`} plain dimColor label="Open" onPress={() => update($, panel, v => ({ ...v, selectedId: a.id }))} />
                  </Box>
                ),
              )}
              {finishedHeader}
              {!p.isDoneCollapsed &&
                finished.map(a => <Svg key={a.id} source={doneSvg(W, a, at)} alt={`${a.description}: ${a.status}`} width={W} height={DONE_H} />)}
            </Box>
          )}
        </Box>
      )
    }

    // Terminal: the same blocks as text rows.
    const cols = Math.max(30, e.props.bodyColumns || 46)
    const width = Math.max(10, Math.min(40, cols - 2))
    const barW = Math.max(6, Math.min(20, cols - 34))
    const agentRow = (a: AgentRun) => {
      const color = agentColor(a)
      const c = ctxOf(a)
      const mark = a.status === 'running' ? '●' : a.status === 'done' ? '✓' : '✗'
      return (
        <Box key={a.id} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={color}>▣</Text>
            <Text bold wrap="truncate-end">
              {a.description || a.type}
            </Text>
            <Text color={a.status === 'failed' ? STATUS.critical : a.status === 'done' ? STATUS.good : color}>{mark}</Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {'  '}
            <Text color={color}>{a.status === 'running' ? nameOf(a) : roleName(costumeOf(a.type))}</Text> {modelName(a.model)}
            {a.effort ? ` · ${a.effort}` : ''}
          </Text>
          <Text wrap="truncate-end">
            {'  '}
            {termGauge(Text, shownPct(c, isLeft), barW, a.status === 'running' && c >= 70 ? STATUS.moderate : color, undefined, isLeft)}
            <Text dimColor>
              {' '}
              ctx {pctText(c, isLeft)} · {fmtK(a.contextTokens)} ≈{fmtCost(a.costUsd ?? 0)} {fmtTime((a.endedAt ?? at) - a.startedAt)}
            </Text>
          </Text>
          {a.status === 'running' && a.lastTool !== '' && (
            <Text dimColor wrap="truncate-end">
              {'  ↳ '}
              {a.lastTool}
            </Text>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {modeToggle}
        <Box flexDirection="column">
          <Text>
            <Text dimColor>Context </Text>
            <Text bold>{pctText(ctx.percent, isLeft)}</Text> <Text color={lv.color}>{lv.word}</Text>
            <Text dimColor>
              {isLeft ? `  ${fmtTokens(Math.max(0, ctx.window - ctx.tokens))} of ${fmtTokens(ctx.window)} left` : `  ${fmtTokens(ctx.tokens)} of ${fmtTokens(ctx.window)}`}
            </Text>
            {ctx.compactAt !== undefined && <Text color={STATUS.moderate}>{`  auto-compact at ${fmtTokens(ctx.compactAt)}`}</Text>}
          </Text>
          {termGauge(Text, shownPct(ctx.percent, isLeft), width, lv.color, ctx.compactAt ? shownPct((ctx.compactAt / ctx.window) * 100, isLeft) : undefined, isLeft)}
        </Box>
        <Box flexDirection="column">
          <Text>
            <Text bold>${cost.toFixed(2)}</Text> <Text dimColor>spent</Text>   <Text bold>{fmtDuration(at - usage.startedAt)}</Text>{' '}
            <Text dimColor>elapsed</Text>
          </Text>
          <Text dimColor>
            {fmtTokens(t.input)} in  {fmtTokens(t.output)} out
            {usage.rateLimits.map(l => `   ${limitName(l.kind)} ${pctText(l.percentUsed, isLeft)}`).join('')}
          </Text>
        </Box>
        <Box flexDirection="column">
          <Text wrap="truncate-end">
            <Text bold>{modelName(model)}</Text>
            <Text dimColor>  {fmtClock(at)}</Text>
          </Text>
          {r ? (
            <Text wrap="truncate-end">
              {r.branch || 'detached'}
              {r.staged > 0 && <Text color={STATUS.good}>  {r.staged} staged</Text>}
              {r.modified > 0 && <Text color={STATUS.moderate}>  {r.modified} modified</Text>}
              {r.untracked > 0 && <Text dimColor>  {r.untracked} new</Text>}
              {(r.added > 0 || r.removed > 0) && <Text dimColor>  +{r.added} −{r.removed}</Text>}
              {r.staged + r.modified + r.untracked + r.added + r.removed === 0 && <Text dimColor>  clean</Text>}
            </Text>
          ) : (
            <Text dimColor>No git repository in this folder</Text>
          )}
        </Box>
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold>Agents</Text>
          </Box>
          {list.length === 0 && <Text dimColor>No agents yet. They show here when Claude starts one.</Text>}
          {list.length > 0 && (
            <Text dimColor>
              {summary}   ≈{fmtCost(totals.cost)}   {fmtK(totals.tokens)} tokens   {fmtTime(totals.time)}
            </Text>
          )}
          <Box flexDirection="column" marginTop={1}>
            {running.map(agentRow)}
            {finishedHeader}
            {!p.isDoneCollapsed && finished.map(agentRow)}
          </Box>
        </Box>
      </Box>
    )
  })
}
