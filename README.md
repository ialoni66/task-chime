# task-chime

A [Claude Code](https://claude.com/claude-code) mod that plays a short sound when Claude finishes a task.

- Plays on every finished answer in the main conversation.
- Stays quiet for interrupted turns, errors, and subagents.
- Optional on-screen signals (a banner above the prompt, a toast, a status line entry), off by default.

## Requirements

| | |
|---|---|
| Claude Code | A version that supports mods (plugins with function hooks) |
| Windows 10 or 11 | For the sound. Uses the built-in Windows PowerShell 5.1 and Windows media player. Nothing to install. |
| macOS | Claude Code plays the clip itself. The PowerShell step is skipped automatically. |
| Linux | No sound. Claude Code has no audio player there and the mod only supports Windows and macOS. |

## Install

Clone the repository, then start Claude Code with the folder as a plugin:

```bash
git clone https://github.com/ialoni66/task-chime.git
claude --plugin-dir ./task-chime
```

I developed and tested it in the Claude desktop app's Code tab with mod hot-reloading. I haven't tested other install routes, so if `--plugin-dir` doesn't suit your setup, check the Claude Code plugin docs.

Check that it loads:

```bash
claude plugin validate ./task-chime
```

## What it does, and what it runs

On each finished answer, the mod:

1. Asks Claude Code to play `assets/notification.mp3` (this works on macOS).
2. On Windows, starts `scripts/chime.ps1` through PowerShell. The script has no window and no network access. It:
   - streams about one second of silence first, so a sleeping Bluetooth headset can wake up before the chime,
   - then plays the mp3, with a couple of copies layered for loudness.

If the script fails, you get a short toast naming the problem.

The mod needs permission to start a local PowerShell process. Read `scripts/chime.ps1` first if you want to see exactly what it does. It is short.

## Settings

Type `/chime` in Claude Code to open the settings pane. It shows each setting with buttons to change it, and a **Play test chime** button so you can hear the result straight away. Click a button, or give the pane focus (click it, or press `ctrl+x` then `tab`) and press its key:

| Key | Action |
|---|---|
| `m` | Mute / unmute |
| `1` / `2` | Quieter / louder |
| `3` / `4` | Fewer / more loudness copies |
| `5` / `6` | Shorter / longer Bluetooth wake-up delay |
| `v` | Turn on-screen signals on / off |
| `t` | Play test chime (plays even when muted) |

The same settings are also rows in the `/config` menu in the terminal version of Claude Code. The desktop app has no `/config`, which is why the pane exists. Either way, changing a setting reloads the mod with the new value, and the pane reopens by itself.

| Setting | Default | What it does |
|---|---|---|
| Mute the chime | off | Turns the sound off |
| Chime volume (0-100) | 75 | Volume of each copy of the chime |
| Loudness boost (1-4) | 2 | Identical copies played together. More is louder but can distort. |
| Bluetooth wake-up delay (ms) | 1000 | Silence played before the chime, 0 to 3000. Raise it if a Bluetooth headset still misses the start. |
| Show on-screen signals | off | Shows a banner above the prompt, a toast, and a status line entry |

Values outside a setting's range are refused. The settings are also stored in your Claude Code settings under `pluginConfigs`, keyed by the plugin name.

If you mute the chime and leave the on-screen signals off, nothing tells you a task finished. Turn on one of them.

To use your own sound, replace `assets/notification.mp3`.

## Troubleshooting

- **No sound at first after being idle:** Bluetooth headsets sleep. Raise the Bluetooth wake-up delay to 1500 or 2000 in `/config`.
- **Too quiet or too loud:** change the volume or loudness boost in `/config`.
- **No sound at all:** check the Windows volume mixer for an entry called "PowerShell", and confirm the right output device is selected.
- **A toast saying "Chime sound failed" or "could not start":** PowerShell may be blocked by a security policy on your machine.
- **No sound right after editing the mod:** reloading the mod can cut off the sound for that one reply. The next reply is normal.

## Development

```bash
claude plugin validate .   # checks the manifest and what the code calls
claude plugin test .       # runs tests/register.test.tsx
```

The tests check the logic: which turns trigger the sound, the command and settings passed to PowerShell, and that nothing visual appears while the visuals are off. They do not play audio, so listening to it is still a manual check.

Project layout:

```
.claude-plugin/plugin.json   name, version, description
hooks/hooks.json             points to the code
hooks/register.tsx           the mod: hooks on turn.complete and the prompt band
scripts/chime.ps1            Windows sound player
assets/notification.mp3      the chime
types/index.d.ts             type contract for the mod's stored state
tests/register.test.tsx      tests
```

## Credits and licence

The code is released under the [MIT licence](LICENSE).

The sound `assets/notification.mp3` is "New Notification 08" by Universfield. It is **not** covered by the MIT licence. Check the terms of the site you download it from before reusing or redistributing it, or swap in a sound of your own.
