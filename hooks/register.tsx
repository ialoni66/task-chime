import type { Register } from 'claude-code'

const SOUND = 'assets/notification.mp3'
const STATUS_MS = 5000

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    // Only the main conversation's finished answers, not subagents or interrupts.
    if (e.agentId !== undefined || e.reason !== 'answer') return result

    $.ui.toast('Task complete')
    $.ui.status('Task complete')
    // Clear the status later; if the mod reloads meanwhile the wait is aborted, which is fine.
    $.clock.sleep(STATUS_MS).then(() => $.ui.status(undefined), () => {})
    await $.audio.play({ asset: SOUND })

    return result
  })
}
