import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const TURN = {
  answer: 'done',
  durationMs: 1200,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
} as const

// Records what the mod asks the engine to show or play, beneath the mod.
function record(on: On, env: Record<string, string> = { OS: 'Windows_NT' }) {
  mock.env(on, env)
  const clock = mock.clock(on)
  const seen = {
    toasts: [] as string[],
    statuses: [] as (string | undefined)[],
    clips: [] as unknown[],
    opened: [] as string[],
    changes: [] as { key: string; value: unknown }[],
    runs: [] as { argv: readonly string[]; env?: Record<string, string> }[],
  }
  // The engine beneath the mod: the settings command and pane, and /config writes.
  on('command.register', (_$, e) => ({ value: { command: e.name } }) as never)
  on('ui.open', (_$, e) => { seen.opened.push(e.id); return { value: { isPlaced: true } } as never })
  on('ui.close', () => ({ value: undefined }) as never)
  on('config.set', (_$, e) => { seen.changes.push({ key: e.key, value: e.value }); return { value: e.value } })
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }) as never)
  // The sound is a spawned child (it outlives the hook); record it and end it cleanly.
  on('process.spawn', async function* (_$, e) {
    seen.runs.push({ argv: e.argv, env: e.env })
    return { value: { code: 0, signal: null } }
  } as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  // These events carry no value; { value: undefined } is how a hook says "handled".
  on('ui.toast', (_$, e) => { seen.toasts.push(e.text); return { value: undefined } as never })
  on('ui.status', (_$, e) => { seen.statuses.push(e.text); return { value: undefined } as never })
  on('audio.play', (_$, e) => { seen.clips.push(e.clip); return { value: undefined } as never })
  // Beneath the mod, the engine's own band: nothing to show, so an empty box.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  return { ...seen, settle: () => clock.settle(), advance: (ms: number) => clock.advance(ms) }
}

describe('task-chime', () => {
  test('a finished answer plays the sound', async ($, on) => {
    const seen = record(on)

    const result = await $.turn.complete({ ...TURN })
    await seen.settle()

    expect(result.text).toBe('done')
    expect(seen.clips).toHaveLength(1)
    expect(seen.clips[0]).toMatchObject({ asset: 'assets/notification.mp3' })
  })

  test('a finished answer runs the sound script with the mp3, lead-in and volume', async ($, on) => {
    const seen = record(on)

    await $.turn.complete({ ...TURN })
    await seen.settle()

    expect(seen.runs).toHaveLength(1)
    expect(seen.runs[0]?.argv[0]).toBe('powershell.exe')
    expect(seen.runs[0]?.env?.CHIME_SOUND).toMatch(/assets[\\/]notification\.mp3$/)
    expect(Number(seen.runs[0]?.env?.CHIME_LEAD_MS)).toBeGreaterThan(0)
    expect(Number(seen.runs[0]?.env?.CHIME_COPIES)).toBeGreaterThanOrEqual(1)
    const volume = Number(seen.runs[0]?.env?.CHIME_VOLUME)
    expect(volume).toBeGreaterThan(0)
    expect(volume).toBeLessThanOrEqual(1)
    expect(seen.runs[0]?.argv).toContain('-File')
    expect(seen.runs[0]?.argv.at(-1)).toMatch(/scripts[\\/]chime\.ps1$/)
  })

  test('off Windows it skips PowerShell and still asks the engine to play the clip', async ($, on) => {
    const seen = record(on, {})

    await $.turn.complete({ ...TURN })
    await seen.settle()

    expect(seen.runs).toEqual([])
    expect(seen.toasts).toEqual([])
    expect(seen.clips).toHaveLength(1)
  })

  describe('settings', () => {
    const BAND = {
      hasSurvey: false,
      isWorking: false,
      maxRows: 6,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 6 },
      view: {},
    } as const
    const SHOWN = { type: 'Text', text: /Task complete/ } as const
    const mountBand = ($: any) =>
      $.ui.mount({ plugin: 'task-chime', surface: 'desktop', component: 'AbovePrompt', props: BAND })

    test('muted: no sound at all', { options: { muted: true } }, async ($, on) => {
      const seen = record(on)

      await $.turn.complete({ ...TURN })
      await seen.settle()

      expect(seen.clips).toEqual([])
      expect(seen.runs).toEqual([])
    })

    test('muted still shows the on-screen signals when they are on', { options: { muted: true, showVisuals: true } }, async ($, on) => {
      const seen = record(on)

      await $.turn.complete({ ...TURN })
      await seen.settle()

      expect(seen.clips).toEqual([])
      expect(seen.runs).toEqual([])
      expect(seen.toasts).toEqual(['Task complete'])
    })

    test('volume is a percentage sent to the script as a fraction', { options: { volume: 50 } }, async ($, on) => {
      const seen = record(on)

      await $.turn.complete({ ...TURN })
      await seen.settle()

      expect(seen.runs[0]?.env?.CHIME_VOLUME).toBe('0.5')
    })

    test('copies and lead-in reach the script', { options: { copies: 3, leadMs: 1500 } }, async ($, on) => {
      const seen = record(on)

      await $.turn.complete({ ...TURN })
      await seen.settle()

      expect(seen.runs[0]?.env?.CHIME_COPIES).toBe('3')
      expect(seen.runs[0]?.env?.CHIME_LEAD_MS).toBe('1500')
    })

    test('a lead-in of 0 is allowed', { options: { leadMs: 0 } }, async ($, on) => {
      const seen = record(on)

      await $.turn.complete({ ...TURN })
      await seen.settle()

      expect(seen.runs[0]?.env?.CHIME_LEAD_MS).toBe('0')
    })

    test('on-screen signals on: toast and status line, status clears after five seconds', { options: { showVisuals: true } }, async ($, on) => {
      const seen = record(on)

      await $.turn.complete({ ...TURN })
      await seen.settle()
      expect(seen.toasts).toEqual(['Task complete'])
      expect(seen.statuses).toEqual(['Task complete'])

      await seen.advance(4999)
      expect(seen.statuses).toEqual(['Task complete'])
      await seen.advance(1)
      expect(seen.statuses).toEqual(['Task complete', undefined])
    })

    test('on-screen signals on: banner appears with Dismiss, then clears after six seconds', { options: { showVisuals: true } }, async ($, on) => {
      const seen = record(on)
      await $.turn.complete({ ...TURN })
      await seen.settle()

      const band = await mountBand($)
      expect(await band.find(SHOWN)).toBeDefined()
      expect(await band.find({ type: 'Button', key: 'dismiss' })).toBeDefined()

      await seen.advance(6000)
      const later = await mountBand($)
      expect(await later.find(SHOWN)).toBeUndefined()
    })

    test('on-screen signals on: Dismiss hides the banner', { options: { showVisuals: true } }, async ($, on) => {
      const seen = record(on)
      await $.turn.complete({ ...TURN })
      await seen.settle()
      const band = await mountBand($)

      await band.press({ key: 'dismiss' })

      expect(await (await mountBand($)).find(SHOWN)).toBeUndefined()
    })
  })

  describe('settings pane', () => {
    const PANE_ID = 'task-chime-settings'
    const PANE_PROPS = {
      title: 'Task chime',
      isFocused: false,
      bodyColumns: 60,
      placement: 'inline',
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    } as const
    const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
    const mountPane = ($: any, surface: (typeof SURFACES)[number]) =>
      $.ui.mount({ plugin: 'task-chime', surface, component: 'Pane', props: PANE_PROPS, requestId: PANE_ID })

    test('/chime opens the pane', async ($, on) => {
      const seen = record(on)

      const result = await $.command.run({ command: 'chime', args: '', origin: { kind: 'composer' } })

      expect(seen.opened).toEqual([PANE_ID])
      expect(result.text).toMatch(/settings opened/i)
    })

    test('shows every setting and a button for it on every surface', async ($, on) => {
      record(on)

      for (const surface of SURFACES) {
        const pane = await mountPane($, surface)
        expect(await pane.find({ type: 'Text', text: /Sound: on/ })).toBeDefined()
        expect(await pane.find({ type: 'Text', text: /Volume: 75/ })).toBeDefined()
        expect(await pane.find({ type: 'Text', text: /Loudness boost: 2 copies/ })).toBeDefined()
        expect(await pane.find({ type: 'Text', text: /wake-up delay: 1000 ms/ })).toBeDefined()
        expect(await pane.find({ type: 'Text', text: /On-screen signals: off/ })).toBeDefined()
        expect(await pane.find({ type: 'Text', text: /Quick controls row above the prompt: on/ })).toBeDefined()
        for (const key of ['mute', 'volume-down', 'volume-up', 'copies-down', 'copies-up', 'lead-down', 'lead-up', 'visuals', 'quick-row', 'test']) {
          expect(await pane.find({ type: 'Button', key })).toBeDefined()
        }
      }
    })

    test('Mute asks Claude Code to set muted to true', async ($, on) => {
      const seen = record(on)
      const pane = await mountPane($, 'desktop')

      await pane.press({ key: 'mute' })

      expect(seen.changes).toEqual([{ key: 'task-chime.muted', value: true }])
    })

    test('when muted the button says Unmute and sets it back', { options: { muted: true } }, async ($, on) => {
      const seen = record(on)
      const pane = await mountPane($, 'desktop')
      expect(await pane.find({ type: 'Text', text: /Sound: muted/ })).toBeDefined()

      await pane.press({ key: 'mute' })

      expect(seen.changes).toEqual([{ key: 'task-chime.muted', value: false }])
    })

    test('Louder and Quieter move the volume by ten', async ($, on) => {
      const seen = record(on)
      const pane = await mountPane($, 'desktop')

      await pane.press({ key: 'volume-up' })
      await pane.press({ key: 'volume-down' })

      expect(seen.changes).toEqual([
        { key: 'task-chime.volume', value: 85 },
        { key: 'task-chime.volume', value: 65 },
      ])
    })

    test('volume stops at 100', { options: { volume: 100 } }, async ($, on) => {
      const seen = record(on)
      const pane = await mountPane($, 'desktop')

      await pane.press({ key: 'volume-up' })

      expect(seen.changes).toEqual([{ key: 'task-chime.volume', value: 100 }])
    })

    test('loudness boost moves by one and stays between 1 and 4', async ($, on) => {
      const seen = record(on)
      const pane = await mountPane($, 'desktop')

      await pane.press({ key: 'copies-up' })
      await pane.press({ key: 'copies-down' })

      expect(seen.changes).toEqual([
        { key: 'task-chime.copies', value: 3 },
        { key: 'task-chime.copies', value: 1 },
      ])
    })

    test('wake-up delay moves by 250 ms', async ($, on) => {
      const seen = record(on)
      const pane = await mountPane($, 'desktop')

      await pane.press({ key: 'lead-up' })
      await pane.press({ key: 'lead-down' })

      expect(seen.changes).toEqual([
        { key: 'task-chime.leadMs', value: 1250 },
        { key: 'task-chime.leadMs', value: 750 },
      ])
    })

    test('the on-screen signals button flips showVisuals', async ($, on) => {
      const seen = record(on)
      const pane = await mountPane($, 'desktop')

      await pane.press({ key: 'visuals' })

      expect(seen.changes).toEqual([{ key: 'task-chime.showVisuals', value: true }])
    })

    test('Play test chime plays the sound, even when muted', { options: { muted: true } }, async ($, on) => {
      const seen = record(on)
      const pane = await mountPane($, 'desktop')

      await pane.press({ key: 'test' })
      await seen.settle()

      expect(seen.clips).toHaveLength(1)
      expect(seen.runs).toHaveLength(1)
      expect(seen.changes).toEqual([])
    })
  })

  describe('quick controls row above the prompt', () => {
    const BAND = {
      hasSurvey: false,
      isWorking: false,
      maxRows: 6,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 6 },
      view: {},
    } as const
    const mountBand = ($: any, surface: 'terminal' | 'desktop' = 'desktop', props: object = BAND) =>
      $.ui.mount({ plugin: 'task-chime', surface, component: 'AbovePrompt', props })

    test('shows the sound state with Mute and Settings buttons, on by default', async ($, on) => {
      record(on)

      for (const surface of ['terminal', 'desktop'] as const) {
        const band = await mountBand($, surface)
        expect(await band.find({ type: 'Text', text: /Chime: on/ })).toBeDefined()
        expect(await band.find({ type: 'Button', key: 'quick-mute' })).toBeDefined()
        expect(await band.find({ type: 'Button', key: 'quick-settings' })).toBeDefined()
      }
    })

    test('says muted and offers Unmute when muted', { options: { muted: true } }, async ($, on) => {
      record(on)

      const band = await mountBand($)

      expect(await band.find({ type: 'Text', text: /Chime: muted/ })).toBeDefined()
      expect(await band.find({ type: 'Button', key: 'quick-mute', text: /Unmute/ })).toBeDefined()
    })

    test('Mute sets muted to true, Unmute sets it back', async ($, on) => {
      const seen = record(on)
      const band = await mountBand($)

      await band.press({ key: 'quick-mute' })

      expect(seen.changes).toEqual([{ key: 'task-chime.muted', value: true }])
    })

    test('Settings opens the settings pane', async ($, on) => {
      const seen = record(on)
      const band = await mountBand($)

      await band.press({ key: 'quick-settings' })

      expect(seen.opened).toEqual(['task-chime-settings'])
    })

    test('can be switched off in settings', { options: { showQuickRow: false } }, async ($, on) => {
      record(on)

      const band = await mountBand($)

      expect(await band.find({ type: 'Text', text: /Chime:/ })).toBeUndefined()
      expect(await band.find({ type: 'Button', key: 'quick-mute' })).toBeUndefined()
    })

    test('steps aside while a survey holds the row', async ($, on) => {
      record(on)

      const band = await mountBand($, 'desktop', { ...BAND, hasSurvey: true })

      expect(await band.find({ type: 'Text', text: /Chime:/ })).toBeUndefined()
    })

    test('shares the row with the banner when on-screen signals are on', { options: { showVisuals: true } }, async ($, on) => {
      const seen = record(on)
      await $.turn.complete({ ...TURN })
      await seen.settle()

      const band = await mountBand($)

      expect(await band.find({ type: 'Text', text: /Task complete/ })).toBeDefined()
      expect(await band.find({ type: 'Button', key: 'dismiss' })).toBeDefined()
      expect(await band.find({ type: 'Text', text: /Chime: on/ })).toBeDefined()
    })

    test('the pane button turns the row off', async ($, on) => {
      const seen = record(on)
      const pane = await $.ui.mount({
        plugin: 'task-chime',
        surface: 'desktop',
        component: 'Pane',
        requestId: 'task-chime-settings',
        props: { title: 'Task chime', isFocused: false, bodyColumns: 60, placement: 'inline', scroll: { offset: 0, bodyRows: 10 }, view: {} },
      })

      await pane.press({ key: 'quick-row' })

      expect(seen.changes).toEqual([{ key: 'task-chime.showQuickRow', value: false }])
    })
  })

  describe('visuals are off by default', () => {
    const BAND = {
      hasSurvey: false,
      isWorking: false,
      maxRows: 6,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 6 },
      view: {},
    } as const

    test('no toast and no status line entry', async ($, on) => {
      const seen = record(on)

      await $.turn.complete({ ...TURN })
    await seen.settle()

      expect(seen.toasts).toEqual([])
      expect(seen.statuses).toEqual([])
    })

    test('no banner above the prompt', async ($, on) => {
      record(on)
      await $.turn.complete({ ...TURN })

      const band = await $.ui.mount({
        plugin: 'task-chime',
        surface: 'desktop',
        component: 'AbovePrompt',
        props: BAND,
      })

      expect(await band.find({ type: 'Text', text: /Task complete/ })).toBeUndefined()
    })
  })

  test('loading the mod clears a leftover status line entry', async ($, on) => {
    const seen = record(on)
    on('session.start', (_$, e) => ({ cwd: e.cwd }))

    await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })

    expect(seen.statuses).toEqual([undefined])
  })

  test('an interrupted turn stays silent', async ($, on) => {
    const seen = record(on)

    await $.turn.complete({ ...TURN, reason: 'aborted', isAborted: true })
    await seen.settle()

    expect(seen.clips).toEqual([])
    expect(seen.runs).toEqual([])
  })

  test('a failed turn stays silent', async ($, on) => {
    const seen = record(on)

    await $.turn.complete({ ...TURN, reason: 'error' })
    await seen.settle()

    expect(seen.clips).toEqual([])
    expect(seen.runs).toEqual([])
  })

  test('a subagent turn stays silent', async ($, on) => {
    const seen = record(on)

    await $.turn.complete({ ...TURN, agentId: 'helper-1' })
    await seen.settle()

    expect(seen.clips).toEqual([])
    expect(seen.runs).toEqual([])
  })

  test('the answer text passes through unchanged', async ($, on) => {
    record(on)

    const result = await $.turn.complete({ ...TURN, answer: 'all good' })

    expect(result.text).toBe('all good')
  })
})
