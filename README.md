# talktome companion module

Bitfocus Companion module for talktome Intercom application.

## Features

- Talk command action (`press`, `release`, `lock-toggle`) against `/api/v1/companion/users/:id/talk`
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
- `Authentication`:
  - `API key` mode: use `API Key`
  - `User login` mode: use `User Name` + `Password`

API key retrieval endpoint:

- `GET /admin/api-key`

Credential login endpoint:

- `POST /api/v1/companion/auth/login`