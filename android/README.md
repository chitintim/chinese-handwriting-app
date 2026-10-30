# 墨字帖 — Android wrapper

Minimal WebView shell (`com.chitintim.moxie`) that bundles the app (the same code as the hosted web app on GitHub Pages) and serves it at
`https://appassets.androidplatform.net/` through `WebViewAssetLoader`. Everything is bundled and works offline; the INTERNET permission is used only to look for a new release / library and to download the new APK (see "In-app updates").
Built **only in GitHub Actions** (no local Android SDK needed).

## Layout

- `app/` — Gradle module (`MainActivity.java`, `MoBridge.java`, `Updater.java`, manifest, `res/xml/file_paths.xml`, icon, theme).
- `ci/build-apk.yml` — the workflow. Copy to `.github/workflows/build-apk.yml` in the public repo.
- `ci/set-secrets.sh` — uploads the signing secrets to the public repo.
- `app/src/main/assets/www/` — **git-ignored**; the workflow fills it with the app bundle (`apk-www/` of the public repo).

Toolchain (keep consistent): AGP 8.5.2, Gradle 8.7, JDK 17 (Temurin), compileSdk/targetSdk 34, minSdk 24,
Java 17 source level, `androidx.webkit:webkit:1.11.0`, `androidx.core:core:1.12.0` (FileProvider only). No Kotlin, no AppCompat, no Gradle wrapper jar
(CI installs Gradle 8.7 via `gradle/actions/setup-gradle`).

## Public repo layout

The public repo (`chitintim/chinese-handwriting-app`) root is the GitHub Pages site and is the hosted web app (`index.html`, `css/`, `js/`, `library/`,
`sw.js`, `manifest.webmanifest`, `icon.svg`) plus `download/index.html` (install page). Next to it: `apk-www/` (the same app bundle without `sw.js`),
`android/` (this folder, verbatim) and `.github/workflows/build-apk.yml`. CI copies `apk-www/` into `android/app/src/main/assets/www/` (it uses the runner's
preinstalled `sdkmanager`, not `android-actions/setup-android`). All of it is produced by `scripts/build.py` + `scripts/publish.sh` in the private source repo.
The web app's home screen links to `releases/latest/download/moxie.apk` (big 安裝 App (APK) button, hidden when `window.MoBridge` exists, i.e. inside this app).

## Releasing

```bash
git tag -a v1.2.0 -m "What changed (shown as the release notes and in the in-app update card)"
git push origin v1.2.0                       # or: Actions -> Build APK -> Run workflow (tag input is required)
```

The tag must look like `vMAJOR.MINOR.PATCH` (minor and patch <= 99). versionName = the tag without the `v` (`1.2.0`); **versionCode = major*10000 + minor*100 + patch**
(`1.2.0` -> 10200), not the run number, so it grows with the version and updates install over old ones (the first tags must give a code above the old run-number codes, e.g. use
v0.5.0 = 500 or higher). The app compares the latest release's `tag_name` with `MoBridge.version()` (`"1.2.0+10200"`).
The workflow builds `assembleRelease`, signs it, verifies with `apksigner`, and creates/updates the Release for that tag with the asset named **`moxie.apk`** (marked latest).
Release notes = the annotated tag's message if the tag is annotated, else the commit subject. Re-running the same tag replaces the asset and the notes.

Stable download URL: https://github.com/chitintim/chinese-handwriting-app/releases/latest/download/moxie.apk

To ship an app update: run build + publish in the source repo (refreshes the web app, `apk-www/` and the download page), then push a new `v*` tag in the public repo.
The web app and the download page always link to `releases/latest`, so they need no change per release. Web users get the new version through the service worker (update card).

## Signing

One stable PKCS12 key (alias `moxie`, RSA 2048, valid until 2056) so every build is an upgrade of the previous one.
It lives **outside any repo**: `~/.config/moxie-signing/moxie.p12` with the password in
`~/.config/moxie-signing/password.txt` (mode 600). **Back these up** — if lost, you must uninstall the app on the
tablet (losing its local data) to install a build signed with a new key.

One-time setup, after the public repo exists and `gh auth login` is done:

```bash
android/ci/set-secrets.sh        # sets MOXIE_KEYSTORE_B64, MOXIE_KEYSTORE_PASSWORD, MOXIE_KEY_ALIAS
```

Gradle reads `MOXIE_KEYSTORE_FILE`, `MOXIE_KEYSTORE_PASSWORD`, `MOXIE_KEY_ALIAS` from the environment
(`storeType 'pkcs12'`, key password = store password). Without them the build produces an unsigned APK.

## Installing on the iReader Smart 6C Pro

1. In the tablet's browser open the web app https://chitintim.github.io/chinese-handwriting-app/ and tap 安裝 App (APK), or the install page .../download/ (or the direct URL above) (or copy `moxie.apk` over USB into Download).
2. Open the downloaded file. When asked, allow "Install unknown apps" for the browser/file manager, then Install.
3. Updates: the app offers them itself (below). Installing a newer `moxie.apk` by hand over the old one (same package + key) also keeps all data.

## Native features

- Fullscreen immersive, white, follows system rotation; renderer crash -> activity is recreated.
- `window.MoBridge`: `isNative()`, `version()` (`"1.2.0+10200"` = `versionName()` + `"+"` + `versionCode()`), `versionName()`, `versionCode()`, `downloadAndInstall(url)` (below), `keepScreenOn(bool)`,
  `saveFile(filename, base64, mime)` -> status string such as `已儲存到 Download/墨/xxx.png` (MediaStore on
  Android 10+, legacy storage + runtime permission on 9 and below; on the first legacy call the user is prompted
  and must press export again). `saveFileAndToast(...)` is the same plus a toast (also used as a fallback for
  `blob:` downloads triggered by `<a download>`).
- Hardware keys: Volume down / Page down / Next -> `window` event `mo-key` with `detail:'next'`; Volume up / Page up /
  Previous -> `'prev'`. These keys are consumed (volume does not change, and the page does not also get a DOM keydown).
  D-pad/arrow keys are left to the page as normal DOM key events.
- Back: asks the page first (never uses WebView history): dispatches cancelable `mo-back` on `window`; if it is
  `preventDefault`ed, or `window.__moHandleBack()` returns `true` (the web app closes the top dialog, or steps back to
  the home screen), the app stays; otherwise (home screen, or no answer within 1 s) it closes.
- Pause: `Activity.onPause` dispatches `window` event `mo-pause` so the page saves unsaved ink immediately.
- The app registers no service worker (skipped when `MoBridge` exists; `apk-www/` does not even contain `sw.js`). `MainActivity` still answers `/sw.js` with a 404 as a safeguard (the APK is the update mechanism).
- External links open in the system browser; all other navigation stays in the app.

## In-app updates (INTERNET, REQUEST_INSTALL_PACKAGES, FileProvider)

- **Detection** (web layer, `app/js/update.js`): at launch (at most once per 24 h, silent when offline) and from 設定 -> 檢查更新, the page fetches
  `https://api.github.com/repos/chitintim/chinese-handwriting-app/releases/latest`, compares `tag_name` (semver, `v` stripped) with `MoBridge.version()` and, when newer,
  shows a static card "有新版本 vX" with the release body as plain text and the buttons 更新 / 稍後 / 用瀏覽器下載 (a plain link to the APK: the app hands non-app URLs to the system browser).
- **`MoBridge.downloadAndInstall(url)`** (`Updater.java`): only URLs under `https://github.com/chitintim/chinese-handwriting-app/`. On API 26+ it first checks
  `canRequestPackageInstalls()`; if the app may not install unknown apps it opens `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` for this package and returns `"permission"` (the page asks the user to
  allow it and tap 更新 again). Otherwise `DownloadManager` (follows the GitHub redirect) downloads to `getExternalFilesDir(DIRECTORY_DOWNLOADS)/moxie-update.apk`, polled every 0.7 s;
  when done the file is checked to be this package (`getPackageArchiveInfo`) and the package installer is started with `ACTION_VIEW` on a `FileProvider` content URI
  (`${applicationId}.fileprovider`, `res/xml/file_paths.xml` shares only that folder). Returns `"started"`, `"permission"` or `"error:<message>"`.
- **Progress** reaches the page as `window.dispatchEvent(new CustomEvent('mo-update', {detail: {state, progress, message}}))`; `state` is `downloading` (progress 0-100), `downloaded`, `installing`,
  `permission` or `error`.
- **Library over the air**: with INTERNET the app also reads `https://chitintim.github.io/chinese-handwriting-app/library/index.json`; if its `version` is higher than the bundled one the home screen offers
  "字帖庫有更新", and 下載 stores the new / changed text files in IndexedDB (`ota:*`, not part of the backup). Fonts are not downloaded: the bundled default font covers GB2312 + Big5, other fonts fall back per character.
  When a later APK bundles a library at least as new, the downloaded copy is dropped.
- Not verified on a device (no Android SDK here; CI is the compiler): the DownloadManager/FileProvider/installer path, API 24-25 (no per-app install permission) and Android 14 behaviour.

## Troubleshooting

- **Workflow fails at "Decode signing keystore"**: secrets missing/wrong; run `ci/set-secrets.sh`, check repo name.
- **`apk-www/index.html missing`**: the app bundle was not published to `apk-www/` in the public repo (run `scripts/publish.sh`).
- **`Signed APK not found` / `app-release-unsigned.apk`**: signing env not reaching Gradle; check the keystore step.
- **Install says "App not installed" / conflicts**: an APK signed with a different key is installed (e.g. a debug
  build); uninstall it first.
- **Blank white screen**: open `chrome://inspect` against a debuggable build, or check the app logs; confirm
  `assets/www/index.html` exists in the APK (`unzip -l moxie.apk | grep www/index.html`).
- **"無法啟動 WebView"**: the device's Android System WebView is missing/disabled.
- **Files not in Download/墨**: on Android 9 and below grant the storage permission when prompted and retry.
- Non-ASCII asset filenames and directories beginning with `_` : aapt2 skips files starting with `.` and
  directories starting with `_` in assets; avoid those names in the web app.
