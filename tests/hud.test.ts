import { expect, mock, test } from 'claude-code/testing'

import { DETAIL_H, doneSvg, fireLevel, LINE_H, sceneSvg } from '../hooks/agents'
import { bandSvg, contextSvg, shownPct } from '../hooks/desktop'
import { parseShortstat, parseStatus } from '../hooks/register'
import type { AgentRun } from '../types'

const SPAWN = {
  tool_use_id: 't1',
  prompt: 'look around',
  description: 'Scan repo',
  subagentType: 'Explore',
  provider: { kind: 'model', model: 'claude-opus-5-5' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
} as const

const PANE = { title: 'Details', isFocused: false, bodyColumns: 50, placement: 'dock' } as never

// The pane exists to show subagents: a spawn must appear running, its turn.complete must mark it done.
for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: a spawned subagent shows running, then finished`, async ($, on) => {
    mock.clock(on, { now: 1_000 })
    on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 50_000, window: 200_000, percent: 25 }, rateLimits: [], cost: { usd: 0.41 } } }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('ui.panes', () => ({ value: [] }))
    on('turn.complete', () => ({ text: 'ok', reason: 'answer' }))
    on('tool.call', () => ({ result: 'ok' }) as never)
    on('ui.open', () => ({ value: undefined }) as never)
    on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))

    await $.agent.spawn(SPAWN as never)
    const ui = await $.ui.mount({ plugin: 'campfire-hud', surface, component: 'Pane', requestId: 'campfire-hud', props: PANE })
    expect(JSON.stringify(await ui.drawn())).toContain('Scan repo')
    expect(JSON.stringify(await ui.drawn())).toContain('1 running, 0 finished')

    // The running row names the agent's current tool and its target.
    for (const tool of ['Read', 'Grep', 'Edit']) {
      await $.tool.call({ tool, tool_use_id: `u-${tool}`, agentId: 'a1', file_path: '/repo/hooks/x.ts', pattern: 'x', old_string: 'a', new_string: 'b' } as never)
    }
    expect(JSON.stringify(await ui.drawn())).toContain('Edit  hooks/x.ts')

    await $.turn.complete({ turnId: 'x', agentId: 'a1', answer: 'ok', durationMs: 5, isAborted: false, reason: 'answer' } as never)
    expect(JSON.stringify(await ui.drawn())).toContain('0 running, 1 finished')
    expect((await ui.findAll({ text: /Finished/ })).length).toBeGreaterThan(0)
    expect(JSON.stringify(await ui.drawn())).toContain('Scan repo')
  })
}

// The REPO row must split staged, modified and untracked the way git reports them.
test('git porcelain and shortstat parse into the REPO counts', () => {
  const s = parseStatus('## feat/x...origin/feat/x [ahead 1]\nM  a.ts\n M b.ts\nMM c.ts\n?? d.ts\n')
  expect(s).toEqual({ branch: 'feat/x', staged: 2, modified: 2, untracked: 1 })
  expect(parseShortstat(' 3 files changed, 12 insertions(+), 4 deletions(-)\n')).toEqual({ added: 12, removed: 4 })
  expect(parseShortstat('')).toEqual({ added: 0, removed: 0 })
})

// The band must always carry both usage windows, even before the API reports one.
for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: band shows 5h and weekly usage with and without readings`, async ($, on) => {
    let limits: { kind: string; percentUsed: number }[] = []
    on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1, window: 1_000_000, percent: 21 }, rateLimits: limits, cost: { usd: 4.19 } } }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    const band = { hasSurvey: false, bodyColumns: 180 } as never

    const empty = JSON.stringify(await (await $.ui.mount({ plugin: 'campfire-hud', surface, component: 'AbovePrompt', requestId: 'b1', props: band })).drawn())
    expect(empty).toContain('5h —')
    expect(empty).toContain('Week —')

    limits = [{ kind: 'five_hour', percentUsed: 12 }, { kind: 'seven_day', percentUsed: 7.4 }]
    const read = JSON.stringify(await (await $.ui.mount({ plugin: 'campfire-hud', surface, component: 'AbovePrompt', requestId: 'b2', props: band })).drawn())
    expect(read).toContain('5h 12%')
    expect(read).toContain('Week 7%')
  })
}

// The list shows one running agent in full; Open must expand the clicked agent in its own place.
test('desktop: Open expands the agent in place and keeps the order', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1, window: 200_000, percent: 1 }, rateLimits: [], cost: { usd: 0 } } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: undefined }) as never)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `a${++n}` }))

  await $.agent.spawn({ ...SPAWN, tool_use_id: 't1', description: 'Oldest task' } as never)
  await $.agent.spawn({ ...SPAWN, tool_use_id: 't2', description: 'Middle task', subagentType: 'Plan' } as never)
  await $.agent.spawn({ ...SPAWN, tool_use_id: 't3', description: 'Newest task', subagentType: 'general-purpose' } as never)
  const ui = await $.ui.mount({ plugin: 'campfire-hud', surface: 'desktop', component: 'Pane', requestId: 'campfire-hud', props: PANE })
  // Each running agent as [task, isExpanded], top to bottom.
  const rows = async () =>
    (await ui.findAll({ type: 'Svg' }))
      .filter(x => x.props.height === DETAIL_H || x.props.height === LINE_H)
      .map(x => [/(Oldest|Middle|Newest) task/.exec(String(x.props.source))?.[1], x.props.height === DETAIL_H])
  expect(await rows()).toEqual([['Newest', true], ['Middle', false], ['Oldest', false]])

  await ui.press({ key: 'open-a1' })
  expect(await rows()).toEqual([['Newest', false], ['Middle', false], ['Oldest', true]])
})

const run = (id: string, type: string, status: AgentRun['status']): AgentRun => ({
  id, type, description: id, model: 'claude-haiku-4-5', status, startedAt: 0, contextTokens: 0, tokens: 0, lastTool: '',
})

// The fire tracks how many agents work together. When none run, the camp waits again.
test('the campfire grows with the party and the camp empties when it is done', () => {
  expect([0, 1, 2, 3, 4, 5, 9].map(fireLevel)).toEqual([0, 1, 1, 2, 2, 3, 3])
  const awake = sceneSvg(360, [run('a', 'Explore', 'running')], [], new Map())
  expect(awake).toContain('class="fl"')
  expect(awake).not.toContain('class="tw"')
  const rested = sceneSvg(360, [], [run('a', 'Explore', 'done'), run('b', 'Plan', 'failed')], new Map())
  expect(rested).not.toContain('class="fl"')
  expect(rested).not.toContain('class="zz"')
  expect(rested).toContain('class="tw"')
  expect(rested).toContain('The party is resting')
})

// Before any agent starts, the camp says so instead of saying the party rests.
test('the camp waits, unlit, before the first agent', () => {
  const waiting = sceneSvg(360, [], [], new Map())
  expect(waiting).toContain('class="tw"')
  expect(waiting).toContain('No agents yet')
  expect(waiting).not.toContain('class="fl"')
})

// The sleeping faces move to the Finished list; a failed agent keeps its crossed eyes.
test('finished rows sleep, failed rows do not', () => {
  expect(doneSvg(360, run('a', 'Explore', 'done'), 0)).toContain('class="zz"')
  expect(doneSvg(360, run('b', 'Plan', 'failed'), 0)).not.toContain('class="zz"')
})

// The gauges must show where auto-compact runs, and nothing when it is off.
for (const surface of ['terminal', 'desktop'] as const) {
  for (const isOn of [true, false]) {
    test(`${surface}: auto-compact marker ${isOn ? 'shows' : 'is absent when off'}`, async ($, on) => {
      mock.clock(on, { now: 1_000 })
      on('session.usage', (_$, e: { breakdown?: string } | undefined) => ({
        value: {
          startedAt: 0,
          context: {
            tokens: 236_000, window: 1_000_000, percent: 24,
            ...(e?.breakdown ? { breakdown: { isAutoCompactEnabled: isOn, autoCompactThreshold: isOn ? 834_000 : undefined } } : {}),
          },
          rateLimits: [], cost: { usd: 1 },
        },
      }) as never)
      on('session.model', () => ({ value: 'claude-opus-5-5' }))
      on('session.start', () => ({ cwd: '/repo' }) as never)
      on('session.cwd', () => ({ value: '/repo' }))
      on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
      on('command.register', () => ({ value: undefined }) as never)
      on('ui.open', () => ({ value: undefined }) as never)
      await $.session.start({ source: 'startup', cwd: '/repo' } as never)

      const pane = JSON.stringify(await (await $.ui.mount({ plugin: 'campfire-hud', surface, component: 'Pane', requestId: 'campfire-hud', props: PANE })).drawn())
      const label = surface === 'desktop' ? 'auto-compact' : 'auto-compact at 834K'
      if (isOn) expect(pane).toContain(label)
      else expect(pane).not.toContain('auto-compact')
    })
  }
}

// Battery mode: /hud left flips every bar and figure to the share left, and the choice is saved.
for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: /hud left shows what is left, and a saved choice comes back`, async ($, on) => {
    mock.clock(on, { now: 1_000 })
    const saved = new Map<string, unknown>()
    on('store.get', (_$, e: { key: string }) => ({ value: saved.get(e.key) }) as never)
    on('store.set', (_$, e: { key: string; value: unknown }) => {
      saved.set(e.key, e.value)
      return { value: undefined } as never
    })
    on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 240_000, window: 1_000_000, percent: 24 }, rateLimits: [{ kind: 'five_hour', percentUsed: 36 }], cost: { usd: 1 } } }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('ui.panes', () => ({ value: [] }))
    on('ui.open', () => ({ value: undefined }) as never)

    await $.command.run({ command: 'hud', args: 'left' } as never)
    expect(saved.get('gaugeMode')).toBe('left')
    const pane = JSON.stringify(await (await $.ui.mount({ plugin: 'campfire-hud', surface, component: 'Pane', requestId: 'campfire-hud', props: PANE })).drawn())
    expect(pane).toContain('76')
    expect(pane).toContain('64% left')
    expect(pane).toContain('Show used')
    const band = JSON.stringify(await (await $.ui.mount({ plugin: 'campfire-hud', surface, component: 'AbovePrompt', requestId: 'b', props: { hasSurvey: false, bodyColumns: 180 } as never })).drawn())
    expect(band).toContain('76% left')

    await $.command.run({ command: 'hud', args: 'used' } as never)
    expect(saved.get('gaugeMode')).toBe('used')
  })
}

// In battery mode a marker keeps marking the same token count, so its place mirrors (on a gauge shifted right by the heart).
test('battery mode mirrors the bar and the auto-compact marker', () => {
  expect(shownPct(24, true)).toBe(76)
  expect(shownPct(24, false)).toBe(24)
  const c = { percent: 24, tokens: 240_000, window: 1_000_000, compactAt: 834_000 }
  expect(contextSvg(360, c, false)).toContain('x="299.2"')
  expect(contextSvg(360, c, true)).toContain('x="72.1"')
})

// Battery mode widens the usage slots; the model and branch must still fit on a normal band.
test('the band keeps the model and branch in both modes', () => {
  const limits = [{ kind: 'five_hour', percentUsed: 52 }, { kind: 'seven_day', percentUsed: 22 }] as never
  for (const isLeft of [false, true]) {
    const band = bandSvg(760, 'claude-opus-5-5', { percent: 60, tokens: 600_000, window: 1_000_000 }, 14.44, 'main', limits, isLeft)
    expect(band).toContain('Opus 5.5')
    expect(band).toContain('>main<')
  }
})

// A narrow terminal must not wrap the band into columns: it drops parts instead of breaking them.
test('terminal: the band fits a narrow terminal on one line', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 190_000, window: 1_000_000, percent: 19 }, rateLimits: [{ kind: 'five_hour', percentUsed: 1 }, { kind: 'seven_day', percentUsed: 81 }], cost: { usd: 0.87 } } }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  // Every text the band draws, in order, as one line with the row's 2-column gaps.
  const line = async (bodyColumns: number) => {
    const tree = await (await $.ui.mount({ plugin: 'campfire-hud', surface: 'terminal', component: 'AbovePrompt', requestId: `b${bodyColumns}`, props: { hasSurvey: false, bodyColumns } as never })).drawn()
    type Node = { props?: { label?: string }; children?: unknown }
    const text = (n: unknown): string =>
      typeof n === 'string' || typeof n === 'number' ? String(n)
      : Array.isArray(n) ? n.map(text).join('')
      : n && typeof n === 'object' ? ((n as Node).props?.label ?? text((n as Node).children))
      : ''
    const row = (tree as unknown as Node).children as unknown[]
    return row.filter(Boolean).map(text).filter(s => s !== '').join('  ')
  }
  const narrow = await line(36)
  expect(narrow.length).toBeLessThanOrEqual(36)
  expect(narrow).toContain('19%')
  expect(narrow).toContain('$0.87')
  expect(narrow).toContain('Details')
  const wide = await line(160)
  expect(wide).toContain('Sonnet 5.5')
  expect(wide).toContain('Week 81%')
})
