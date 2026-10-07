import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

// The banner, toast and status line. Off for now: set to true to bring them back.
const SHOW_VISUALS = false

const SOUND = 'assets/notification.mp3'
const SOUND_SCRIPT = 'scripts\\chime.ps1'
const BANNER_MS = 6000
const STATUS_MS = 5000
// Silence streamed before the chime so a sleeping Bluetooth headset can wake first.
const LEAD_MS = 1000
// How loud: identical copies of the chime played together add up (1 to 4; 2 is about twice
// the amplitude). Raise it if the chime is too quiet, lower it if it distorts.
const COPIES = 2
// Volume of each copy, 0 to 1. 2 copies at 1.0 was a little loud; 0.75 is about 1.5x one full copy.
const VOLUME = 0.75

const isBannerShown = atom({ plugin: 'task-chime', key: 'isBannerShown' } as const, false)

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    // Only the main conversation's finished answers, not subagents or interrupts.
    if (e.agentId !== undefined || e.reason !== 'answer') return result

    // In-app signals: the banner above the prompt, a toast and a status entry.
    // Off for now (SHOW_VISUALS); with them off, the sound is the only signal.
    if (SHOW_VISUALS) {
      await update($, isBannerShown, () => true)
      $.ui.toast('Task complete')
      $.ui.status('Task complete')
      // Clear them later; if the mod reloads meanwhile the wait is aborted, which is fine.
      $.clock.sleep(BANNER_MS).then(() => update($, isBannerShown, () => false), () => {})
      $.clock.sleep(STATUS_MS).then(() => $.ui.status(undefined), () => {})
    }

    // macOS plays the clip itself; Windows and Linux have no player, so this is a no-op there.
    $.audio.play({ asset: SOUND }).catch(err => {
      $.ui.log(`task-chime: audio.play failed: ${String(err)}`, { to: 'debug' })
    })

    // Windows: scripts/chime.ps1 plays the mp3 with no window. spawn, not run: a
    // spawned child and its loop outlive the hook's return, so the turn is never held up.
    void (async () => {
      try {
        const child = $.process.spawn({
          argv: [
            'powershell.exe',
            '-NoProfile',
            '-NonInteractive',
            '-WindowStyle',
            'Hidden',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            `${$.plugin.root}\\${SOUND_SCRIPT}`,
          ],
          env: {
            CHIME_SOUND: `${$.plugin.root}\\${SOUND.replace('/', '\\')}`,
            CHIME_LEAD_MS: String(LEAD_MS),
            CHIME_COPIES: String(COPIES),
            CHIME_VOLUME: String(VOLUME),
          },
        })[Symbol.asyncIterator]()
        let stderr = ''
        for (;;) {
          const step = await child.next()
          if (step.done) {
            if (step.value?.code !== 0) $.ui.toast(`Chime sound failed: ${stderr.slice(0, 120)}`)
            break
          }
          if (step.value.stream === 'stderr') stderr += step.value.text
        }
      } catch (err) {
        $.ui.toast(`Chime sound could not start: ${String(err).slice(0, 120)}`)
      }
    })()

    return result
  })

  // The banner: shown above the prompt while isBannerShown is true.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isBannerShown))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text bold>Task complete </Text>
        <Button key="dismiss" label="Dismiss" onPress={() => update($, isBannerShown, () => false)} />
      </Box>
    )
  })
}
