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
