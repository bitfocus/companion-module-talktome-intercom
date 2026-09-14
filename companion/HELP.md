# talktome

Control a talktome intercom server from Companion.

## Release notes

### v1.3.0

- Added Production selection for production-scoped users, targets, realtime state and tally.
- Added separate PGM (red) and PRV (green) tally actions and feedbacks.
- Existing tally actions without a bus selection continue to use PGM.

### v1.2.2

- Target actions now show only the destination field relevant to the selected target type.
- Fixed volume, mute and talk actions being skipped by Companion 5 when an unused dynamic target field contained an unavailable value.

### v1.2.1

- Preset previews keep their target labels and volume gauges visible while users are logged out, targets are offline, or the module is disconnected.
- Layered target labels now shrink to remain on one line instead of wrapping a single trailing character onto a second line.

### v1.2.0

- Added Companion 5 layered target presets with native volume gauges.
- Added the talktome muted-speaker icon to muted target presets while preserving their current status color.
- Updated the module to Companion Module API 2.1.
- Companion 5 uses the new layered presets with simple preset fallbacks. Older Companion installations remain on the compatible v1.1.1 module release.

## Connection

Fill in these settings in the module configuration:

- `Server Host`
- `Server Port`
- `Allow self-signed TLS`
- `Production`: select the Production controlled by this module instance. Save a valid connection first, then reopen the configuration to load the available Productions. `Primary production` remains compatible with servers that have Multiple Productions disabled.
- `Authentication`
  - `API key`: enter the server `API Key`
  - `User login`: enter `User Name` and `Password`

In `User login` mode, the visible users and generated presets depend on the scope returned by the talktome server for that account.

## Actions

- `Send talk command` (`press`, `release`, or `lock-toggle`)
- `Change target volume`
- `Mute target`
- `Send tally` (`PGM` red or `PRV` green; set or clear)

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
- draws the current target volume as a native gauge in Companion 5
- shows the talktome muted-speaker icon while preserving the current target status color
- retains the segmented volume bar and red mute feedback in the simple preset fallback
- for `conference` and `user` targets, button press/release also sends talk
- for `feed` targets, the preset is audio-only
- holding multiple PTT presets at the same time addresses all of their targets in parallel

PTT target presets show target online/offline state, active talk state, mute state and "addressed now". In Companion 5,
the mute state uses the same muted-speaker icon as the `Audio` preset.

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
- Target volume
- Target volume bar
- Target online
- Target offline
- Target speaks to user (now)
- Last pressed target offline
- User is being addressed (now)
- User not logged in
- User on PGM (red tally)
- User on PRV (green tally)
- Last command failed

## Variables

Per user:

- reply source
