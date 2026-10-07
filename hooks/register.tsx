import type { Register } from 'claude-code'

const SOUND = 'assets/notification.mp3'
const POPUP_SCRIPT = 'scripts\\popup.ps1'
const STATUS_MS = 5000
const POPUP_MS = 3500

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    // Only the main conversation's finished answers, not subagents or interrupts.
    if (e.agentId !== undefined || e.reason !== 'answer') return result

    // In-app signals: always shown, so the sound is never the only signal.
    $.ui.toast('Task complete')
    $.ui.status('Task complete')
    // Clear the status later; if the mod reloads meanwhile the wait is aborted, which is fine.
    $.clock.sleep(STATUS_MS).then(() => $.ui.status(undefined), () => {})

    // macOS plays the clip itself; Windows and Linux have no player, so this is a no-op there.
    $.audio.play({ asset: SOUND }).catch(err => {
      $.ui.log(`task-chime: audio.play failed: ${String(err)}`, { to: 'debug' })
    })

    // Windows: centered popup plus sound, from scripts/popup.ps1. It never takes
    // keyboard focus. spawn, not run: a spawned child and its loop outlive the
    // hook's return, so the turn is never held up.
    void (async () => {
      try {
        const child = $.process.spawn({
          argv: [
            'powershell.exe',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            `${$.plugin.root}\\${POPUP_SCRIPT}`,
          ],
          env: {
            CHIME_SOUND: `${$.plugin.root}\\${SOUND.replace('/', '\\')}`,
            CHIME_POPUP_MS: String(POPUP_MS),
          },
        })[Symbol.asyncIterator]()
        let stderr = ''
        for (;;) {
          const step = await child.next()
          if (step.done) {
            if (step.value?.code !== 0) $.ui.toast(`Chime popup failed: ${stderr.slice(0, 120)}`)
            break
          }
          if (step.value.stream === 'stderr') stderr += step.value.text
        }
      } catch (err) {
        $.ui.toast(`Chime popup could not start: ${String(err).slice(0, 120)}`)
      }
    })()

    return result
  })
}
