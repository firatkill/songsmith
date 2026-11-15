# Local web, iOS and Android development

## Prerequisites

Install Watchman with `brew install watchman` for Metro file watching on macOS. Use Node 24 (`.nvmrc`), pnpm 10.18.3 (`corepack prepare pnpm@10.18.3 --activate`), and Docker Desktop. Install Xcode **26.4 or newer** (the [Expo SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/#support-for-android-and-ios-versions) lists 26.4+), select it with `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, accept its licence and install an iOS runtime in Settings → Platforms. In Devices and Simulators create an **iPhone 17**.

Install CocoaPods with `brew install cocoapods` before building iOS; otherwise Expo may attempt a system-Ruby gem installation that needs sudo.

Install Android Studio, then SDK Platform Tools, Android Emulator and an ARM64 Google APIs system image (the owner's image is Android 36.1). Create an AVD in Device Manager. The owner's AVD is `Medium_Phone_API_36.1`. Android Studio includes JBR 21; no separate Java installation is necessary.

Add these lines to your shell configuration, then open a new terminal:

```sh
export LANG=en_US.UTF-8
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$HOME/.maestro/bin:$PATH"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

The scripts resolve adb/emulator through `ANDROID_HOME`, then `ANDROID_SDK_ROOT`, then `~/Library/Android/sdk`. They use Android Studio's JBR when `JAVA_HOME` is unset. The iOS build command defaults unset `LANG` and `LC_ALL` to `en_US.UTF-8` for CocoaPods. Maestro also needs Java: `/usr/bin/java` on macOS is only a stub. `e2e:mobile` passes `JAVA_HOME`, using the Android Studio JBR fallback, and disables Maestro analytics and analysis notifications. Maestro installation:

```sh
curl -Ls "https://get.maestro.mobile.dev" | bash
maestro --version
```

Alternatively, install Maestro through Homebrew:

```sh
brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro
```

## Clean clone and first builds

From the repository root:

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev:check
pnpm db:start
pnpm mobile:build:ios
pnpm mobile:build:android
```

Stop each build's Metro server with Ctrl-C before starting the next command. Do not run `pnpm dev:all` at the same time as a `mobile:build:*` command: both use port 8081. These are free local **development builds**, not Expo Go; no Apple/Google developer account is needed. Builds use `com.songsmith.app.dev`, scheme `songsmith`, Expo Router routes under `mobile/app/`, and New Architecture. Prebuild generates ignored `mobile/ios` and `mobile/android`; don't commit those folders. No native build runs during installation or CI.

`dev:check` warns about missing Watchman, development builds and Maestro, and fails for missing CocoaPods or Xcode below 26.4. It fails for missing prerequisites, unrelated port listeners or an invalid/missing `.env.local`. Empty or whitespace-only optional entries copied from the example are treated as unset by server and client validation and use defaults; required Supabase credentials must still be injected. Local Supabase credentials, including the public Expo URL/anon key, are injected from `supabase status`; do not paste credentials into a terminal or commit them. Mock mode needs no provider keys. The root environment is backend-only except explicitly public fields. `EXPO_PUBLIC_*` fields are embedded in the app bundle and must never contain service-role credentials.

## Daily use

```sh
pnpm dev:check
pnpm dev:all
```

This starts Supabase only if needed, without resetting it, then Redis, API, worker, web and Metro. It boots the preferred iPhone/first AVD if none is running. Override names with `SONGSMITH_IOS_SIMULATOR` and `SONGSMITH_ANDROID_AVD` in `.env.local`. Installed development builds are stopped before opening against Metro, preventing a second development-client context. Every device command gets up to three attempts, with 1s then 2s delays and a 30s command timeout to tolerate a busy machine. Only the final failure reports stderr. Missing builds print install guidance immediately without retry. If a build is missing the launcher prints the exact build command and keeps the other services running.

Ctrl-C stops the launched child process groups. Supabase, Redis and simulators remain available; stop containers explicitly when finished:

```sh
pnpm db:stop
pnpm redis:down
```

Web development writes to `.next-development/dev`; production builds, type generation and Playwright retain `.next`. This separates their output roots using Next’s documented [distDir option](https://nextjs.org/docs/app/api-reference/config/next-config-js/distDir), without deleting production output between commands.

`pnpm dev` retains its Redis/API/worker/web behavior and requires Supabase already running. `pnpm dev:mobile` starts only Metro against the running local backend. For a physical device, set `EXPO_PUBLIC_DEV_HOST` to the Mac's LAN IP/hostname; connect it to the same network. iOS Simulator uses `localhost`, Android Emulator uses `10.0.2.2`, for both API port 4000 and Supabase port 54321. `EXPO_PUBLIC_API_URL` overrides only the API. Never use Android's `localhost` for a service on the Mac.

## Sign in and review

Open web at <http://localhost:3000/en> or `/tr`, and use the installed Songsmith app on each simulator. Enter a fresh email address, open Mailpit at <http://localhost:54324>, and copy its six-digit OTP. Enter an adult date, accept the three required notices, leave optional marketing/analytics off if desired, and continue. Mobile opens Create, with empty Library and Explore tabs. Profile shows the handle, Settings → Language, and sign out. Device language chooses Turkish for `tr`, English otherwise; an explicit choice persists locally. System light/dark mode selects the shared Pop studio palette.

Use a separate fresh email to test underage refusal: the backend deletes the account and blocks re-registration for 30 days. DOB is transient and not persisted. OTP resend has a 60-second cooldown. No live model, content creation, player, purchase, push or download is present.

## Maestro M-01

Keep `pnpm dev:all` running, and run:

```sh
pnpm e2e:mobile
pnpm e2e:mobile ios
```

Android is the default. Run on a dedicated test simulator: M-01 clears app state and the iOS simulator keychain, then opens the Metro development URL with onboarding disabled. The native `expo-dev-client` plugin sets `showMenuAtLaunch: false` and `skipOnboarding: true`. **Rebuild existing development apps with `pnpm mobile:build:android` (or `pnpm mobile:build:ios`) for these defaults to take effect.** See [SDK 58 dev-client configuration](https://docs.expo.dev/versions/v58.0.0/sdk/dev-client/#configuration-in-app-config). The shared URL also uses SDK 58 reserved `__expo_url`, `__expo_disable_auto_launch`, `__expo_disable_onboarding` and `__expo_disable_fab` parameters. M-01 defensively taps the backdrop above the sheet when Tools or Fast Refresh is visible; no Back action is used. It waits up to 30 seconds for a cold bundle and initial SecureStore key creation, then stops/reopens once if needed. See [Expo development launch parameters](https://docs.expo.dev/develop/development-builds/development-workflows/#deep-linking-to-an-updates-url). M-01 creates a unique `e2e+<uuid>@example.test` identity, obtains only that recipient's OTP via the **host** Mailpit HTTP API, enters an adult DOB, grants mandatory consents, and asserts Create using test IDs. It doesn't delete other mail. Local test identities remain until an intentional database reset. Maestro is not part of PR CI; nightly device testing comes later.

## Troubleshooting

- Metro reports `EMFILE: too many open files, watch`: install Watchman (`brew install watchman`) and restart Metro outside the restricted sandbox. `CI=1 pnpm dev:mobile` can verify serving without watchers, but disables hot reload and is only a diagnostic fallback.
- Metro cache: stop Metro, run `pnpm --filter @songsmith/mobile exec expo start --dev-client --clear`, then reopen the app. Build shared packages first with `pnpm --filter '@songsmith/mobile^...' build`.
- Native dependency/config change: stop Metro and rerun the relevant `mobile:build:*` command. If generated folders are stale, run `SONGSMITH_NATIVE_DEVELOPMENT=1 pnpm --filter @songsmith/mobile exec expo prebuild --clean` first. This replaces generated native folders only.
- Android HTTP: local build scripts set `SONGSMITH_NATIVE_DEVELOPMENT=1`; only this explicit development config enables cleartext. The default config disables cleartext; never set that variable for release builds. There is no release profile yet.
- Ports: `dev:check` distinguishes repository processes and named local Docker services from unrelated listeners. Inspect a conflict with `lsof -nP -iTCP:<port> -sTCP:LISTEN`; stop the owning application rather than blindly killing processes. Required ports: 3000, 4000, 6379, 8081, 54321–54324.
- Auth/network errors: confirm API and Supabase are running, check the emulator host mapping, and use Retry. Never expose service-role keys to fix client auth. A changed anon key requires restarting Metro.
- File watching restrictions: `SONGSMITH_DEV_POLLING=1` enables the existing web/API polling fallback. Run native tools outside restricted agent sandboxes when CoreSimulator/Hypervisor access is denied.
- Before resetting the database for tests, stop dev services and any other Playwright run. `dev:all` never performs a reset.

## Machine capacity (A-13)

Owner review machine: Apple M4, 24 GB RAM, Xcode 26.2, iOS 26.2 runtime, iPhone 17 simulator, Android 36.1 ARM64 AVD, JBR 21. The reviewer built Android successfully, started API/worker/web/Metro with `dev:all`, and passed M-01 with the corrected launch sequence. iOS compilation on Xcode 26.2 failed in `expo-modules-jsi` (`JavaScriptObject.swift:946`, Swift 6: "sending 'slot' risks causing data races"). The owner is updating Xcode; keep SDK 58. iOS and simultaneous-device A-13 verification remain pending.

Provisional minimum for the documented setup: Apple Silicon Mac with 16 GB RAM and sufficient free storage for Xcode, SDK images, Docker and generated builds (allow at least 50 GB). This is a planning floor, not a measured performance guarantee. Prefer 24 GB for simultaneous web, Docker and two devices. On a smaller machine run one simulator at a time: start Supabase, `pnpm dev`, and `pnpm dev:mobile`, then open only the iOS or Android development build. Do not use `dev:all` for that fallback because it intentionally boots both.

Expo dependency installation follows the [official Router installation guide](https://docs.expo.dev/router/installation/). SDK 58 versions are checked with `pnpm --filter @songsmith/mobile exec expo install --check`.

Maestro launch/reset behavior follows its [launchApp reference](https://docs.maestro.dev/reference/commands-available/launchapp); HTTP OTP fetching follows the [JavaScript HTTP reference](https://docs.maestro.dev/maestro-flows/javascript/make-http-requests).
