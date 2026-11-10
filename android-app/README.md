# TOBY Music — Android app

This is a thin, online-only Android WebView shell for the existing production platform
at **https://students.tobymusic.club/**. It does not copy student records or sync data
independently. The canonical data source stays in the existing Dropbox/Worker service.

## Build

The feature-branch GitHub Actions workflow `build-android-app.yml` produces a
**debug-signed APK** as a downloadable Actions artifact. GitHub's hosted Android SDK
and Gradle build it without touching the production Cloudflare deployment.

Local build with Android SDK 35 and Gradle 8.10.2:

```sh
mkdir -p android-app/app/src/main/res/drawable
cp public/assets/brand/icon-192.png android-app/app/src/main/res/drawable/toby_icon.png
cd android-app
gradle :app:assembleDebug
```

APK: `android-app/app/build/outputs/apk/debug/app-debug.apk`

## Behaviour

- The app stays on the live HTTPS site. Content updates are shown on reopening.
- Internal navigation stays in WebView. External HTTPS/mailto/tel links use the OS.
- HTML file chooser allows authorized manager upload through Android Documents UI.
- Audio capture prompts for Android microphone permission only on the trusted domain.
- HTTPS downloads use Android DownloadManager; same-origin blob exports open the
  Android document-save picker (48 MiB max).
- Requires internet; no standalone/offline copy of the student platform.

## Important limitations

- WebView browser data is independent of Chrome; an existing Chrome session may
  require logging in again. Never place credentials in the APK.
- This app does NOT change existing server-side student/data permissions. Per-student
  confidentiality still depends on server enforcement, not an app wrapper.
- GitHub CI build success does not prove authenticated real-device payment,
  file upload/download, PDF printing, or microphone flows. **Device tests required**.
- The produced DEBUG APK is for personal installation/testing. Each fresh runner may
  use a different debug signing certificate, so updates can require uninstall/reinstall
  (which clears WebView local app state). Publishable/repeatable releases require a
  privately managed release keystore in GitHub Actions Secrets, not source control.
- Do not use this wrapper to bypass device filtering or network access policies.
