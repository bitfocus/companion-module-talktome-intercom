# talktome

Control a talktome intercom server from Companion.

## Connection

Fill in these settings in the module configuration:

- `Server Host`
- `Server Port`
- `Allow self-signed TLS`
- `Authentication`
  - `API key`: enter the server `API Key`
  - `User login`: enter `User Name` and `Password`

In `User login` mode, the visible users and generated presets depend on the scope returned by the talktome server for that account.

## Actions

- `Send talk command` (`press`, `release`, or `lock-toggle`)
- `Change target volume`
- `Mute target`
- `Send tally`

## Presets

The module creates preset folders named after each user:

- `<name>`

Each user folder contains:

- one `REPLY` PTT button
- one PTT button per assigned `conference` or `user` target
- one `Audio` rotary preset per assigned `conference`, `user`, or `feed` target

The `REPLY` preset:

- shows the current reply source on the button
- uses press/release talk to the current reply target
- shows when a reply target is available

The `Audio` preset:

- uses rotary left/right for `Change target volume`
- draws the current target volume as a segmented bar on the button
- keeps the muted target state visible through the red mute feedback
- for `conference` and `user` targets, button press/release also sends talk
- for `feed` targets, the preset is audio-only
- holding multiple PTT presets at the same time addresses all of their targets in parallel

PTT target presets show target online/offline state, active talk state, mute state and "addressed now".

## Feedback

Available feedbacks include:

- Connected
- No connection
- User online
- User talking
- User talking to target
- User talking via reply
- Reply available
- User talk lock
- Target muted
- Target volume bar
- Target online
- Target offline
- Target speaks to user (now)
- Last pressed target offline
- User is being addressed (now)
- User not logged in
- User on-air (cut-camera)
- Last command failed

## Variables

Per user:

- reply source
