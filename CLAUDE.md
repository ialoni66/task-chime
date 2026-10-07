# task-chime (folder: claude-noti-mod)

The plugin name in `plugin.json` is `task-chime`: names starting with `claude-` are reserved and fail validation.

A Claude Code mod that tells the user when a task is complete.

## Goal
When Claude finishes a task, the mod:
1. Plays a short **sound notification**.
2. Shows a small **on-screen effect** (toast and/or status line entry) confirming completion.

## Scope
In scope: completion sound, completion visual indicator, a way to turn the sound off.
Out of scope for v0.1: permission-request alerts, error alerts, custom sound pickers, GUI settings.

## Mod structure
```
claude-noti-mod/
├── .claude-plugin/plugin.json   # name, version, description
├── hooks/hooks.json             # { "modules": ["./register.tsx"] }
├── hooks/register.tsx           # hooks: sound + visual on completion
├── assets/                      # sound file(s) played via $.audio.play({ asset })
├── types/index.d.ts             # only if the mod keeps $.state
└── CLAUDE.md
```

## How it works (to verify while building)
- Candidate trigger: the `turn.complete` event. Confirm it fires when a task finishes, not on every step (`turn.step`).
- Sound: `$.audio.play({ asset })`, with the audio file stored in `assets/`.
- Visual: `$.ui.toast(text)` and/or `$.ui.status(text)`. Clear the status entry after a short delay.
- The API types are the source of truth. Grep them for the exact event and method names before using them.

## Commands
- Validate: `claude plugin validate .`
- Type-check: `tsc -p .` (after the mod has loaded once)
- Tests: `claude plugin test .` (write `*.test.ts` for the behaviour)
- Manual run: `claude --plugin-dir <path to this folder>`

## Accessibility rules
- Sound is never the only signal, and the visual is never the only signal. Always provide both.
- The visual must be readable without color: use words like "Task complete", not just a color or symbol.
- Keep toasts short and do not flash or animate rapidly.
- Provide a way to mute the sound (option or slash command).
- Keep the sound short, not startling, and moderate in volume.

## Git conventions
- Small, focused commits with clear messages.
- One branch per feature; merge when it works.
- Do not commit secrets or personal paths.

## Status
- [x] Create mod skeleton (plugin.json, hooks.json, register.tsx)
- [x] Confirm the completion event (turn.complete, main loop, reason "answer")
- [x] Add sound
- [x] Add on-screen effect
- [ ] Add mute option
- [x] Write tests and validate
- [ ] README and license before publishing
