import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const SOUND = 'assets/notification.mp3'
const SOUND_SCRIPT = 'scripts\\chime.ps1'
const PANE = 'task-chime-settings'
const BANNER_MS = 6000
const STATUS_MS = 5000

const isBannerShown = atom({ plugin: 'task-chime', key: 'isBannerShown' } as const, false)
const isSettingsOpen = atom({ plugin: 'task-chime', key: 'isSettingsOpen' } as const, false)
const note = atom({ plugin: 'task-chime', key: 'note' } as const, '')

type Settings = { volumePercent: number; copies: number; leadMs: number }

// A number setting, held to its range; anything else falls back to the default.
const setting = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

const step = (value: number, delta: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value + delta))

// Plays the chime now. macOS plays the clip through audio.play; Windows and Linux have no
// player there, so on Windows scripts/chime.ps1 plays the mp3 with no window.
const playChime = ($: any, s: Settings) => {
  $.audio.play({ asset: SOUND }).catch((err: unknown) => {
    $.ui.log(`task-chime: audio.play failed: ${String(err)}`, { to: 'debug' })
  })

  // spawn, not run: a spawned child and its loop outlive the hook's return, so the turn
  // is never held up.
  void (async () => {
    // PowerShell and the Windows media player exist only on Windows (it sets OS=Windows_NT).
    if ((await $.env.get('OS')) !== 'Windows_NT') return
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
          CHIME_LEAD_MS: String(s.leadMs),
          CHIME_COPIES: String(s.copies),
          CHIME_VOLUME: String(s.volumePercent / 100),
        },
      })[Symbol.asyncIterator]()
      let stderr = ''
      for (;;) {
        const next = await child.next()
        if (next.done) {
          if (next.value?.code !== 0) $.ui.toast(`Chime sound failed: ${stderr.slice(0, 120)}`)
          break
        }
        if (next.value.stream === 'stderr') stderr += next.value.text
      }
    } catch (err) {
      $.ui.toast(`Chime sound could not start: ${String(err).slice(0, 120)}`)
    }
  })()
}

// Changes one setting. Claude Code writes it and reloads the mod, which closes the pane;
// session.start reopens it.
const change = async ($: any, field: string, value: boolean | number) => {
  const done = await $.config.set({ key: `task-chime.${field}`, value })
  if (done.deny !== undefined) {
    await update($, note, () => `Could not change that setting: ${done.deny}`)
  }
}

// The user's settings are declared as userConfig in plugin.json, so they also live in the
// /config menu where there is one. The desktop app has none, so /chime opens a pane that
// changes the same settings. A change reloads the mod, so they are read once here.
export const register: Register = (on, options) => {
  const isMuted = options.muted === true
  const showVisuals = options.showVisuals === true
  const settings: Settings = {
    volumePercent: Math.round(setting(options.volume, 75, 0, 100)),
    copies: Math.round(setting(options.copies, 2, 1, 4)),
    leadMs: Math.round(setting(options.leadMs, 1000, 0, 3000)),
  }

  on('session.start', async ($, e, next) => {
    // The banner flag and status line outlive a reload, but the timers that clear them
    // do not. Clear any leftover when the mod loads (a reload fires session.start again).
    await update($, isBannerShown, () => false)
    $.ui.status(undefined)

    await $.command.register({ name: 'chime', description: 'Open the task-chime settings pane' })
    // A setting change reloads the mod and closes the pane; bring it back.
    if (await read($, isSettingsOpen)) void $.ui.open({ id: PANE, title: 'Task chime' })

    return next(e)
  })

  on('command.run', { command: 'chime' }, async $ => {
    await update($, isSettingsOpen, () => true)
    await update($, note, () => '')
    await $.ui.open({ id: PANE, title: 'Task chime' })

    return { text: 'Task chime settings opened.' }
  })

  // Remember when the person closes the pane themselves, so a reload does not reopen it.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind !== 'unload') await update($, isSettingsOpen, () => false)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    // Only the main conversation's finished answers, not subagents or interrupts.
    if (e.agentId !== undefined || e.reason !== 'answer') return result

    // In-app signals: the banner above the prompt, a toast and a status entry.
    if (showVisuals) {
      await update($, isBannerShown, () => true)
      $.ui.toast('Task complete')
      $.ui.status('Task complete')
      // Clear them later; if the mod reloads meanwhile the wait is aborted, which is fine.
      $.clock.sleep(BANNER_MS).then(() => update($, isBannerShown, () => false), () => {})
      $.clock.sleep(STATUS_MS).then(() => $.ui.status(undefined), () => {})
    }

    if (!isMuted) playChime($, settings)

    return result
  })

  // The banner: shown above the prompt while isBannerShown is true.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!showVisuals || e.props.hasSurvey || !(await read($, isBannerShown))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text bold>Task complete </Text>
        <Button key="dismiss" label="Dismiss" onPress={() => update($, isBannerShown, () => false)} />
      </Box>
    )
  })

  // The settings pane. Every control is a Button with a letter or digit key, so it works
  // from the keyboard once the pane has focus (ctrl+x tab, or a click).
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const message = await read($, note)
    const { volumePercent, copies, leadMs } = settings

    return (
      <Box flexDirection="column">
        <Text bold>Task chime settings</Text>
        {message !== '' && <Text>{message}</Text>}
        <Box>
          <Text>{`Sound: ${isMuted ? 'muted' : 'on'}   `}</Text>
          <Button key="mute" hotkey="m" label={isMuted ? 'Unmute' : 'Mute'} onPress={() => change($, 'muted', !isMuted)} />
        </Box>
        <Box>
          <Text>{`Volume: ${volumePercent}   `}</Text>
          <Button key="volume-down" hotkey="1" label="Quieter" onPress={() => change($, 'volume', step(volumePercent, -10, 0, 100))} />
          <Text> </Text>
          <Button key="volume-up" hotkey="2" label="Louder" onPress={() => change($, 'volume', step(volumePercent, 10, 0, 100))} />
        </Box>
        <Box>
          <Text>{`Loudness boost: ${copies} ${copies === 1 ? 'copy' : 'copies'}   `}</Text>
          <Button key="copies-down" hotkey="3" label="Fewer" onPress={() => change($, 'copies', step(copies, -1, 1, 4))} />
          <Text> </Text>
          <Button key="copies-up" hotkey="4" label="More" onPress={() => change($, 'copies', step(copies, 1, 1, 4))} />
        </Box>
        <Box>
          <Text>{`Bluetooth wake-up delay: ${leadMs} ms   `}</Text>
          <Button key="lead-down" hotkey="5" label="Shorter" onPress={() => change($, 'leadMs', step(leadMs, -250, 0, 3000))} />
          <Text> </Text>
          <Button key="lead-up" hotkey="6" label="Longer" onPress={() => change($, 'leadMs', step(leadMs, 250, 0, 3000))} />
        </Box>
        <Box>
          <Text>{`On-screen signals: ${showVisuals ? 'on' : 'off'}   `}</Text>
          <Button key="visuals" hotkey="v" label={showVisuals ? 'Turn off' : 'Turn on'} onPress={() => change($, 'showVisuals', !showVisuals)} />
        </Box>
        <Box>
          <Button key="test" hotkey="t" variant="primary" label="Play test chime" onPress={() => playChime($, settings)} />
        </Box>
      </Box>
    )
  })
}
