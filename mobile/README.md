# Holy Sai 360 — Android app

A native Android app (Kotlin + Jetpack Compose, no Expo) for the Holy Sai REST API.
Home shows the signed-in user's role and their main jobs as tiles; everything else is
in the ☰ menu, including the "Me" group (My Attendance, Leave, Payslips, Notifications,
Tasks, Profile) shared by every staff role.

## Build the APK

Needs the Android SDK (installed with Android Studio). Gradle is downloaded by the wrapper.

```bash
cd mobile/android
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
./gradlew assembleRelease
```

Output: `app/build/outputs/apk/release/app-release.apk`.

Without `keystore.properties` the release build is signed with the local debug key. That is
fine for sideloading but not for Play Store. To use your own key, create
`mobile/android/keystore.properties` (never committed) with `storeFile`, `storePassword`,
`keyAlias` and `keyPassword`.

## Server address

The default is `https://holy-sai.onrender.com` (`DEFAULT_API_URL` in `app/build.gradle.kts`).
You can change it on the sign-in screen under **Server settings**. For a local API on the
emulator, use `http://10.0.2.2:4000`. Plain HTTP is allowed only for the local development
hosts listed in `res/xml/network_security_config.xml`.

## GPS Tracker mode

The same app can turn a phone into a student's GPS device (the prototype for dedicated trackers).
On the sign-in screen tap **Use this phone as a GPS tracker** — no user account is needed on the phone.

1. On the web, register a device of type **Android phone** (GPS Devices → Register device) and pick
   **Android phone setup** in the token window.
2. In the app, **Scan setup QR** (or scan it with the phone camera — the `holysai-tracker:` link opens
   the app). The server address, device ID and token are stored in encrypted preferences.
3. **Show device QR** and scan it on the student's page to assign the phone to the student.
4. **START TRACKING** runs a location foreground service (`tracker/TrackerService.kt`) that posts the
   newest fix to `POST /api/v1/location` every 30 s, queues points while offline, and stops if the
   token is revoked.

Permissions: fine location, notifications (Android 13+), camera (setup QR). Set the app's battery
usage to **Unrestricted** on tracker phones. Details: [docs/GPS-DEVICES.md](../docs/GPS-DEVICES.md).
