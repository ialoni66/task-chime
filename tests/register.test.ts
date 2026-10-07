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
function record(on: On) {
  const seen = {
    toasts: [] as string[],
    statuses: [] as (string | undefined)[],
    clips: [] as unknown[],
    runs: [] as { argv: readonly string[]; env?: Record<string, string> }[],
  }
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }) as never)
  // The popup is a spawned child (it outlives the hook); record it and end it cleanly.
  on('process.spawn', async function* (_$, e) {
    seen.runs.push({ argv: e.argv, env: e.env })
    return { value: { code: 0, signal: null } }
  } as never)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  // These events carry no value; { value: undefined } is how a hook says "handled".
  on('ui.toast', (_$, e) => { seen.toasts.push(e.text); return { value: undefined } as never })
  on('ui.status', (_$, e) => { seen.statuses.push(e.text); return { value: undefined } as never })
  on('audio.play', (_$, e) => { seen.clips.push(e.clip); return { value: undefined } as never })
  return seen
}

describe('task-chime', () => {
  test('a finished answer shows the message and plays the sound', async ($, on) => {
    const seen = record(on)
    mock.clock(on)

    const result = await $.turn.complete({ ...TURN })

    expect(result.text).toBe('done')
    expect(seen.toasts).toEqual(['Task complete'])
    expect(seen.statuses).toEqual(['Task complete'])
    expect(seen.clips).toHaveLength(1)
    expect(seen.clips[0]).toMatchObject({ asset: 'assets/notification.mp3' })
  })

  test('a finished answer opens the centered popup with the sound file', async ($, on) => {
    const seen = record(on)
    mock.clock(on)

    await $.turn.complete({ ...TURN })

    expect(seen.runs).toHaveLength(1)
    expect(seen.runs[0]?.argv[0]).toBe('powershell.exe')
    expect(seen.runs[0]?.env?.CHIME_SOUND).toMatch(/assets[\\/]notification\.mp3$/)
    expect(seen.runs[0]?.argv).toContain('-File')
    expect(seen.runs[0]?.argv.at(-1)).toMatch(/scripts[\\/]popup\.ps1$/)
  })

  test('the status line clears after five seconds', async ($, on) => {
    const seen = record(on)
    const clock = mock.clock(on)

    await $.turn.complete({ ...TURN })
    await clock.advance(4999)
    expect(seen.statuses).toEqual(['Task complete'])

    await clock.advance(1)
    expect(seen.statuses).toEqual(['Task complete', undefined])
  })

  test('an interrupted turn stays silent', async ($, on) => {
    const seen = record(on)
    mock.clock(on)

    await $.turn.complete({ ...TURN, reason: 'aborted', isAborted: true })

    expect(seen.toasts).toEqual([])
    expect(seen.statuses).toEqual([])
    expect(seen.clips).toEqual([])
    expect(seen.runs).toEqual([])
  })

  test('a failed turn stays silent', async ($, on) => {
    const seen = record(on)
    mock.clock(on)

    await $.turn.complete({ ...TURN, reason: 'error' })

    expect(seen.toasts).toEqual([])
    expect(seen.clips).toEqual([])
  })

  test('a subagent turn stays silent', async ($, on) => {
    const seen = record(on)
    mock.clock(on)

    await $.turn.complete({ ...TURN, agentId: 'helper-1' })

    expect(seen.toasts).toEqual([])
    expect(seen.clips).toEqual([])
    expect(seen.runs).toEqual([])
  })

  test('the answer text passes through unchanged', async ($, on) => {
    record(on)
    mock.clock(on)

    const result = await $.turn.complete({ ...TURN, answer: 'all good' })

    expect(result.text).toBe('all good')
  })
})
