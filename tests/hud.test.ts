import { expect, mock, test } from 'claude-code/testing'

import { DETAIL_H, fireLevel, sceneSvg } from '../hooks/agents'
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

// The list shows one running agent in full; Open must move the full view to another.
test('desktop: Open shows another running agent in full', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1, window: 200_000, percent: 1 }, rateLimits: [], cost: { usd: 0 } } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: undefined }) as never)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `a${++n}` }))

  await $.agent.spawn({ ...SPAWN, tool_use_id: 't1', description: 'Older task' } as never)
  await $.agent.spawn({ ...SPAWN, tool_use_id: 't2', description: 'Newer task', subagentType: 'Plan' } as never)
  const ui = await $.ui.mount({ plugin: 'campfire-hud', surface: 'desktop', component: 'Pane', requestId: 'campfire-hud', props: PANE })
  const detail = async () => JSON.stringify((await ui.findAll({ type: 'Svg' })).filter(x => x.props.height === DETAIL_H).map(x => x.props.source))
  expect(await detail()).toContain('Newer task')

  await ui.press({ key: 'open-a1' })
  expect(await detail()).toContain('Older task')
})

const run = (id: string, type: string, status: AgentRun['status']): AgentRun => ({
  id, type, description: id, model: 'claude-haiku-4-5', status, startedAt: 0, contextTokens: 0, tokens: 0, lastTool: '',
})

// The fire tracks how many agents work together, and goes out when none do.
test('the campfire grows with the party and goes out when it is done', () => {
  expect([0, 1, 2, 3, 4, 5, 9].map(fireLevel)).toEqual([0, 1, 1, 2, 2, 3, 3])
  const awake = sceneSvg(360, [run('a', 'Explore', 'running')], [], new Map())
  expect(awake).toContain('class="fl"')
  expect(awake).not.toContain('class="zz"')
  const asleep = sceneSvg(360, [], [run('a', 'Explore', 'done'), run('b', 'Plan', 'failed')], new Map())
  expect(asleep).not.toContain('class="fl"')
  expect(asleep.match(/class="zz"/g)?.length).toBe(1)
})

// Before any agent starts, the camp must read as not started, not as a party that went to sleep.
test('the camp waits, unlit, before the first agent', () => {
  const waiting = sceneSvg(360, [], [], new Map())
  const asleep = sceneSvg(360, [], [run('a', 'Explore', 'done')], new Map())
  expect(waiting).toContain('class="tw"')
  expect(waiting).toContain('No agents yet')
  expect(waiting).not.toContain('class="fl"')
  expect(asleep).not.toContain('class="tw"')
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
