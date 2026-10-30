# 墨字帖 — Android wrapper

Minimal WebView shell (`com.chitintim.moxie`) that bundles the app (the product; there is no browser version) and serves it at
`https://appassets.androidplatform.net/` through `WebViewAssetLoader`. No INTERNET permission.
Built **only in GitHub Actions** (no local Android SDK needed).

## Layout

- `app/` — Gradle module (`MainActivity.java`, `MoBridge.java`, manifest, icon, theme).
- `ci/build-apk.yml` — the workflow. Copy to `.github/workflows/build-apk.yml` in the public repo.
- `ci/set-secrets.sh` — uploads the signing secrets to the public repo.
- `app/src/main/assets/www/` — **git-ignored**; the workflow fills it with the app bundle (`apk-www/` of the public repo).

Toolchain (keep consistent): AGP 8.5.2, Gradle 8.7, JDK 17 (Temurin), compileSdk/targetSdk 34, minSdk 24,
Java 17 source level, `androidx.webkit:webkit:1.11.0`. No Kotlin, no AppCompat, no Gradle wrapper jar
(CI installs Gradle 8.7 via `gradle/actions/setup-gradle`).

## Public repo layout

The public repo (`chitintim/chinese-handwriting-app`) root is the GitHub Pages site: `index.html` (download page) and `library/`
(the open content library). Next to it: `apk-www/` (the app bundle: `index.html`, `css/`, `js/`, `library/`), `android/` (this
folder, verbatim) and `.github/workflows/build-apk.yml`. CI copies `apk-www/` into `android/app/src/main/assets/www/`.
All of it is produced by `scripts/build.py` + `scripts/publish.sh` in the private source repo.

## Releasing

```bash
git tag v1.0.0 && git push origin v1.0.0     # or: Actions -> Build APK -> Run workflow
```

versionName = tag without the `v`; versionCode = `github.run_number` (monotonic, so updates install over old ones).
The workflow builds `assembleRelease`, signs it, verifies with `apksigner`, and creates/updates the Release for
that tag with the asset named **`moxie.apk`** (marked latest). Manual runs use input `tag`, defaulting to `v1.0.<run>`.
Re-running the same tag replaces the asset.

Stable download URL: https://github.com/chitintim/chinese-handwriting-app/releases/latest/download/moxie.apk

To ship an app update: run build + publish in the source repo (refreshes `apk-www/` and the download page), then push a new `v*` tag in the public repo.
The download page always links to `releases/latest`, so it needs no change per release.

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

1. In the tablet's browser open the download page https://chitintim.github.io/chinese-handwriting-app/ (or the direct URL above) (or copy `moxie.apk` over USB into Download).
2. Open the downloaded file. When asked, allow "Install unknown apps" for the browser/file manager, then Install.
3. Updates: download and install the newer `moxie.apk` over the old one (same package + key = data kept).

## Native features

- Fullscreen immersive, white, follows system rotation; renderer crash -> activity is recreated.
- `window.MoBridge`: `isNative()`, `version()` (`"1.0.0+12"`), `keepScreenOn(bool)`,
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
- The app has no service worker. `MainActivity` still answers `/sw.js` with a 404 as a leftover safeguard (the APK is the update mechanism).
- External links open in the system browser; all other navigation stays in the app.

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
