# talktome

Control a talktome intercom server from Companion.

## Connection

Fill in these settings in the module configuration:

- `Server Host`
- `Server Port`
- `Authentication`
  - `API key`: enter the server `API Key`
  - `User login`: enter `User Name` and `Password`

If the talktome server uses a self-signed certificate, enable the matching TLS option in the module if present in your installed build.

## What The Module Does

- Sends talk commands to talktome users
- Changes target volume in fixed 5% steps and toggles target mute
- Shows live feedback for online state, talking state, talk lock and on-air state
- Builds presets automatically per available user

## Presets

The module creates preset folders in the format:

- `Users/<name>`

Each user folder contains:

- one `REPLY` button
- one button per assigned talk target

In `User login` mode:

- a normal user only gets their own buttons
- a superadmin can access all users

## Feedback

Available feedbacks include:

- Connection ok
- No connection
- User online
- User talking
- User talk lock
- User on-air
- Last command failed

## Notes

- Changes in talktome user targets are reflected in Companion after the module reconnects or refreshes its live state.
- Target audio commands require a talktome server build that exposes the Companion endpoint `/api/v1/companion/users/:id/target-audio`.
- If the server configuration changes, reconnect the module or reload the Companion connection.
