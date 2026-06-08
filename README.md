# strip-volatile

A [pi.dev](https://pi.dev) extension that strips volatile runtime data from `settings.json` on exit, preventing it from being persisted across sessions.

## What it strips

By default, these keys are stripped:

| Key | Why it's volatile |
|-----|-------------------|
| `defaultModel` | Set whenever you change models — leaks the last model used |
| `defaultProvider` | Set alongside `defaultModel` |
| `lastChangelogVersion` | Written on every version bump to control changelog display |

### Custom keys

You can configure which keys are stripped by adding a `stripVolatileKeys` array to your `settings.json`:

```json
{
  "stripVolatileKeys": ["defaultModel", "defaultProvider", "lastChangelogVersion", "someOtherKey"]
}
```

When `stripVolatileKeys` is present and non-empty, **only** the keys listed in that array are stripped. The `stripVolatileKeys` setting itself is preserved so it can remain in `settings.json` as persistent configuration. If the array is missing or empty, the built-in defaults above are used. This means you can add or remove keys without any code changes.

## Install

```bash
pi install git:github.com/mcowger/pi-strip-volatile
```

Or add to your `settings.json`:

```json
{
  "packages": ["git:github.com/mcowger/pi-strip-volatile"]
}
```

## How it works

The extension reads `settings.json`, removes the configured (or default) volatile keys, and writes the file back using synchronous I/O. It runs on `session_start`, `agent_start`, `agent_end`, and `session_shutdown` so volatile keys are cleaned up both during the session and on exit.

Respects `PI_CODING_AGENT_DIR` if set (with `~` expansion), otherwise defaults to `~/.pi/agent`.

## Develop

```bash
bun install
bun run check       # lint + typecheck + test
pi -e .             # load extension locally
```

## License

MIT
