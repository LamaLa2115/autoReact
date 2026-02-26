# AutoReact Vencord Plugin

Auto-react to messages with a custom emoji, with target filters and prefix-command control.

## Install
1. Open your Vencord source repo.
2. Copy this folder to `src/userplugins/autoReact`.
3. Build/reload Vencord.
4. Enable `AutoReact` in Vencord plugin settings.

## Settings
- `Enabled`: turn plugin on/off
- `Emoji`: unicode (`👍`) or custom (`<:name:123456789012345678>`)
- `Open Emoji Picker`: opens Discord emoji picker
- `Target mode`: `Everyone`, `Only me`, `Selected users`
- `Selected User IDs`: comma-separated IDs/mentions for `Selected users` mode
- `React to self`: used only in `Everyone` mode
- `React to bots`: include/exclude bots
- `Cooldown (ms)`: minimum delay between reactions

## Prefix Commands
Use from your own account:
- `%autoreact status`
- `%autoreact emoji 😎`
- `%autoreact mode self`
- `%autoreact mode selected`
- `%autoreact add @username`
- `%autoreact remove @username`
- `%autoreact clear`
- `%autoreact enabled true`
- `%autoreact self true`
- `%autoreact bots false`
- `%autoreact cooldown 1000`
- `%autoreact help`

## Command Feedback
On successful command execution:
- Plugin sends `Done: <ms>ms`
- Plugin deletes your prefix command message after 5 seconds
- Plugin deletes the `Done` response after 5 seconds

Invalid/help/status responses are sent as normal messages and auto-deleted after 5 seconds too.

## Notes
- Cooldown helps reduce Discord rate-limit risk in busy channels.
- Reacting requires normal Discord permissions (for example, Add Reactions).
- Deleting messages requires permissions for those messages/channels.
- If the emoji picker doesn't open from settings, focus any chat input and try the button again.
