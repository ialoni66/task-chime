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
    runs: [] as { argv: readonly string[]; env?: Record<string, string> }[],
  }
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
  return { ...seen, settle: () => clock.settle() }
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

  describe('visuals are off for now', () => {
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
