# talktome companion module

Bitfocus Companion module for talktome Intercom application.

## Features

- Talk command action (`press`, `release`, `lock-toggle`) against `/api/v1/companion/users/:id/talk`
- Realtime feedback via Socket.IO namespace `/companion`
- Boolean feedbacks:
  - Connection ok
  - No connection
  - User online
  - User talking
  - User talk lock
  - User on-air (`cut-camera`)
  - Last command failed
- Variables:
  - `connection_state`
  - `users_online_count`
  - `users_talking_count`
  - `cut_camera_user`
  - `last_command_*`
- Auto-generated presets per user category (`Users/<name>`)
- Per user: one `REPLY` button plus one PTT button for every assigned `user`/`conference` target
- In `User login` auth mode:
  - non-superadmin accounts can control only their own user presets/actions
  - superadmin accounts can control all users

## Configure

In Companion module settings:

- `Server Host` and `Server Port`
- HTTPS is always used by the module
- `Allow self-signed TLS` (on for local certs)
- `Authentication`:
  - `API key` mode: use `API Key`
  - `User login` mode: use `User Name` + `Password`

API key retrieval endpoint:

- `GET /admin/api-key`

Credential login endpoint:

- `POST /api/v1/companion/auth/login`

## Local development

```bash
npm install
npm run check
npm run build
npm run smoke
```

`npm run smoke` starts an isolated temporary talktome server instance and verifies:
- Companion API key authentication and config/state endpoints
- Companion credential login scopes (`all` for superadmin, `self` for operator)
- Admin provisioning flow (create users/conferences/targets)
- Socket.IO realtime events (`snapshot`, `user-targets-updated`, `cut-camera`, `command-result`)

Optional environment variables:
- `SMOKE_PORT` to override HTTPS port (default `18443`)
- `SMOKE_API_KEY` to override API key used during test
- `SMOKE_SERVER_NODE` to force a specific node runtime for the spawned server
- `TALKTOME_REPO_ROOT` to point the smoke test at the main talktome app repo
- `TALKTOME_SERVER_ENTRY` to point directly at a specific `server.js`
