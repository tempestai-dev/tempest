# Tempest Mobile

Companion app for the Tempest desktop. Drives your agents from your phone
while you're away from the laptop.

Standalone Expo app — detached from the workspace so Metro on Windows
doesn't have to follow the hoisted `@tempest/*` symlinks. Shared types +
crypto + transport are vendored under `lib/tempest/` (see
`metro.config.js`). If the desktop protocol changes, re-copy from
`packages/{core,crypto,transport}/src/`.

## Requirements

- Node 20+, Expo CLI (`npm i -g expo`)
- iOS: Xcode + a paid Apple Developer Program account for TestFlight
- Android: Play Console for internal testing (optional)
- Same-Wi-Fi as the laptop for pairing (see below)

## Transport

Initial release uses a **LAN localhost transport**. The desktop opens a
WebSocket router bound on `0.0.0.0`, the QR carries
`ws://<laptop-lan-ip>:<port>/ws`, and the phone dials it directly over
Wi-Fi. No third party in the wire path.

Off-network (cloudflared quick tunnel) is still in-tree behind
`TEMPEST_MOBILE_TRANSPORT=tunnel` on the desktop, but the default is `lan`.

## Dev

```
cd apps/mobile
npm install
npm start          # Expo dev server
npm run ios        # iOS simulator (also works on device via Expo Go)
```

Set `EXPO_PUBLIC_DEV=true` to force the welcome screen on every launch,
regardless of stored pairings — used while iterating on onboarding UI.

## Building for TestFlight (preview profile)

```
npm i -g eas-cli
eas login                              # once, per developer
cd apps/mobile
eas build:configure                    # fills in projectId in app.json
eas build --profile preview --platform ios
```

The `preview` profile produces an ad-hoc / internal-distribution IPA. For
TestFlight external testing use `--profile production` and follow with
`eas submit --platform ios`.

Before first build:
- Set the correct `ios.bundleIdentifier` in `app.json` (currently
  `com.tempestai.mobile` — change to whatever exists in your Apple
  Developer account).
- Update `ios.buildNumber` on each new build (or let
  `production.autoIncrement` handle it).

## Testing the pair flow

1. Start the desktop: `npm run tauri dev` from the repo root.
2. Desktop → Settings → Mobile → Generate pairing QR. Confirm the URL
   under the QR is `ws://<your-laptop-lan-ip>:<port>/ws`.
3. On the phone, open the app, tap Get Started → Pair, scan the QR.
4. You should land in the session list within a second; a red dot on a
   session means an agent is waiting for approval.
5. Tap in, watch the terminal stream in xterm, send prompts via the input
   row. `Interrupt` sends Ctrl-C; `Stop` tears down.

## Protocol versioning

Both sides carry a version constant and a min-compatible pair:

- Desktop: `DESKTOP_PROTOCOL_VERSION` / `MIN_COMPATIBLE_MOBILE_VERSION`
  in `src/lib/mobileBridge/bridge.ts`.
- Mobile:  `MOBILE_PROTOCOL_VERSION` / `MIN_COMPATIBLE_DESKTOP_VERSION`
  in `apps/mobile/screens/Connected.js`.

Exchanged as the first RPC (`protocol.hello`) after every connect. An
incompatible pair hard-blocks with an update screen instead of misbehaving
silently. Bump only on BREAKING wire changes.

## Not in this release

- Push notifications for tool-call approvals (needs a hosted relay; LAN
  transport can't reach a backgrounded phone anyway).
- Dedicated Approve/Deny buttons — the terminal input row routes `y\r` /
  `n\r` to the agent, so approvals work when the app is open.
- Off-network transport (see `TEMPEST_MOBILE_TRANSPORT=tunnel` for the
  in-tree cloudflared path once we're ready to ship it).
