# 墨字帖 Mòzìtiè

## Hey guys, it's Tim 👋

I vibe-coded this while spending a lot of time sitting with my mom in hospital.

She's been a devoted Buddhist for a very long time (皈依 many years ago), and 抄心經 is something close to her heart. Me? I wouldn't call myself a Buddhist — more someone slowly learning about it. This gave me something calm to do with my hands (and my brain) while I'm here.

It started as “I just want a nice way to 抄心經 on my e-ink tablet”. One sutra, simple.

Then my ADHD brain and Claude got involved. A couple of days later there's a full on library, a brush engine that reads pen pressure and tilt, stroke-order animations, 解說, a scroll-style export, a phone mode… 😅 Thanks, Claude.

Add it to the pile of my countless half finished vibe-coding projects — except this one I actually use.

Funny thing about that tablet: the iReader was actually a gift for Mom a few months ago, back when she could still read. She'd mentioned long reads were getting hard, and I thought an e-ink tablet might help. Now it's the thing I 抄經 on, sitting next to her.

嗨，我是 Tim。這個小工具，是我在醫院陪媽媽的日子裡慢慢做出來的。媽媽是虔誠的佛教徒，很多年前已經皈依；我自己不算是佛教徒，只是在慢慢學習。抄抄經、寫寫字，讓我在這裡的時間多了一份安靜。這部 iReader，本來是幾個月前買給媽媽看書用的；現在，它陪我在她身邊抄經。本來只想好好抄一篇《心經》，結果一不小心越做越大……（謝謝 Claude 😅）

*For Mom.* 🙏

### If this is useful to you 隨喜 🙏

It's free and always will be. If you'd like to give something back, please consider a kind donation to one of these:

- **[Dana-Farber Cancer Institute](https://danafarber.jimmyfund.org/site/Donation2?df_id=10522&mfc_pref=T&10522.donation=form1)** (Boston) — Mom has been fighting ovarian cancer, and we spent a couple of months at Dana-Farber. The people there are incredible. On that form you can direct your gift to the **Gynecologic Oncology Program** (which covers ovarian cancer).
- **[西方寺 Western Monastery](https://www.wm.org.hk/)** (荃灣, Hong Kong) — where Mom spent so much of her time 禮佛, back when she could still go. If you're ever in Hong Kong, it's a beautiful, peaceful place to visit — 隨喜 there in person if you like.

---

## What is this?

**Tracing practice for Chinese calligraphy and sutra copying (抄經, 臨帖), built for e-ink tablets like the iReader Smart 6C Pro.** It also runs on phones, iPad + Apple Pencil and any modern browser.

A light-grey kai glyph sits in every cell, like tracing paper, and you ink over it with a pen or your finger. No accounts, no ads, nothing uploaded.

**Contents:**
[Get it](#get-it) ·
[Features](#features) ·
[Library](#library) ·
[Privacy](#privacy) ·
[Device notes & FAQ](#device-notes--faq) ·
[Nerdy bits](#nerdy-bits) ·
[Licenses & credits](#licenses--credits) ·
[Changelog](#changelog)

---

## Get it

| Device | How |
|---|---|
| Android / e-ink tablet | Install the APK (below) |
| iPhone / iPad | Open the web version in Safari and **Add to Home Screen** |
| Computer / any browser | Open the web version |

### Android APK

1. Download **<https://github.com/chitintim/chinese-handwriting-app/releases/latest/download/moxie.apk>** (all versions: [Releases](https://github.com/chitintim/chinese-handwriting-app/releases); install page: <https://chitintim.github.io/chinese-handwriting-app/download/>).
2. Open the file. If asked, allow your browser or file manager to install from unknown sources (未知來源), then tap Install.
3. Updates: the app checks GitHub for a newer release (at most once a day, or via 設定 → 檢查更新) and can download and install it itself. The new APK installs over the old one and keeps all your data.

Needs Android 7.0+ (API 24) with Android System WebView. Works fully offline.

### Web version

**<https://chitintim.github.io/chinese-handwriting-app/>**

Works offline after the first visit. When a new version is out, an "update available" card (有新版本) appears on the home screen. Nothing reloads by itself, so you never lose ink.

### iPhone / iPad

- No App Store app, so use the web version in **Safari**.
- **Add to Home Screen** (Share button → 加入主畫面) and open it from the icon. Safari can wipe a plain tab's site data, ink included, after about 7 days without a visit. A Home Screen web app is exempt. The app reminds you once.
- Still back up now and then: 設定 → 資料 → 匯出完整備份.
- iPad + Apple Pencil gets the tablet layout with pressure and tilt. Set 螢幕類型 to 一般螢幕 (light-grey solid grid) under 設定 → 顯示.

### Phones

When the screen's short side is under 520 px, the app switches to a one-character-at-a-time layout (or force it via 設定 → 顯示 → 版面 → 手機): big cell, a strip showing the 3 characters before and after, section title and progress, and buttons for 上一字, 下一字, 撤銷, 清除, 筆順 and 解說. Write with a finger or stylus; finger stroke width follows speed (slower = thicker). When you finish a character, it moves on after a short pause.

Ink is stored exactly as on the tablet layout, so you can start on a tablet and continue on a phone (move data with 設定 → 資料 → 匯出完整備份 / 匯入備份).

### Data stays separate

The web app and the APK keep separate storage (設定 → 資料 says so too). To move between them, make a backup in one (設定 → 資料 → 匯出完整備份) and import it in the other (匯入備份 → 合併).

---

## Features

### Templates and fonts
- **Modes:** 描 (trace the grey template, default), 臨 (copy from a small reference), 默 (write from memory, with a hint button).
- **Template fonts** (設定 → 字體): 楷書 AR PL UKai (default; covers the whole library plus GB2312 / Big5, so custom texts work too), 正楷 TW-Kai, 行楷 Ma Shan Zheng, 硬筆 LXGW WenKai. A character missing from one font falls back to the next, per character.
- **Sizes:** five glyph sizes (0.60 / 0.70 / 0.75 / 0.80 / 0.90 of cell width) and six cell sizes.
- **Grids:** 米字格 or 田字格, with the outer frame and inner lines toggled separately. Tracing style: grey, halftone or outline.
- **E-ink mode** draws guides as black dots by default, because fast refresh modes (極速 / 快刷) drop light greys. 筆測 → 對比測試 shows what your refresh mode actually displays.

### Brush engine
- **Brushes:** 毛筆 (default, fine), 經典, 秀麗筆, 硬筆, 鋼筆, custom.
- Reads pressure and tilt. Line width is for your normal pressure; 筆壓幅度 (small / medium / large) sets how much heavier a hard press gets.
- 3-step pressure calibration (筆測 → 校準): light, normal, hard. A tuning panel lets you build a custom preset and copy its parameters.
- The 筆測 page shows what your pen really reports (pressure, tilt, event rate) and has an edge test.

### Layout
- 直書 (right to left) or 橫書. Optional title page, 迴向偈, date and name line (落款). Punctuation sits small in the cell corner.
- Title, date and signature are traceable too, and your name can become a **seal** (印章).
- Per-page undo, pen-end eraser (if your pen has one), clear page, **refresh** (a full-screen flash to clear ghosting) and **auto page turn** (1 / 2 / 3 s after a page fills, default 2).
- **Edge margins** avoid the screen edges where pens lose signal (default 3.5 % bottom, 1 % sides and top).

### Bookshelf
Home is a bookshelf: **continue writing** (jumps to your first empty cell), **favourites** (☆ / ★, whole texts or single sections) and the **library** (categories, sort, search). Each section tracks progress and completion count. Starting a section you have already finished begins a **new writing** (再抄一遍) and keeps the finished one; **新抄一遍** archives the current one the same way. **My works 我的作品** lists every writing (in progress, finished, archived), newest first, with a small preview, a filter by status and text, and 繼續 / 檢視 / 匯出 / 備份 / 刪除. **Custom** takes your own pasted text, kept on your device and included in backups.

### Section notes 解說
82 of the 85 texts have per-section notes: summary, plain-language translation, key lines, glossary, background. They show after you finish a section (can be turned off). **Side-by-side mode** keeps the summary and glossary next to (landscape) or below (portrait) the writing area. The notes are AI-assisted, for study only.

### Stroke order 筆順
Double-tap a cell with a finger (設定 → 雙擊看筆順; pen mode only, with palm rejection), or press the 筆順 button. A popup shows a coarse, e-ink-friendly 4-step animation with stroke numbers and direction arrows; replay, step and speed controls included. Data comes from hanzi-writer-data and follows the **mainland standard**, so some Traditional characters may differ from the Taiwan standard. A few rare characters (mostly 詩經 and 楚辭 variants) have no data and show 「找不到筆順資料」.

### Export
Export re-flows the whole text into a finished piece instead of stitching screen pages together.
- **Formats:** single sheet, **handscroll** (long vertical banner), or paged (PNG per page or one **PDF**), optionally merged into a long image (right to left for 直書, top to bottom for 橫書).
- **Options:** rice paper or white; 朱絲欄 / 烏絲欄 / 米字格 / none; title, 落款 (干支 or Gregorian date + 敬書 / 恭錄 / 沐手敬書), 迴向, seal.
- Works from the current or any archived copy. Max 8192 px per side, about 16 MP.

### Also
- **Offline:** the APK, and the web version after its first load.
- **Backup:** 設定 → 資料 shows the space used, whether the browser promised to keep your data (申請長期保存) and the date of the last backup, and saves a full backup as one compressed `墨字帖-備份-YYYYMMDD.moxie` file (copies, ink, favourites, custom texts, settings; plain `.json` where the browser cannot compress). A single text or a single writing can be backed up from 我的作品 or the text page. Importing first shows what is in the file, then **merges** (adds and updates, never deletes; a writing that differs on both sides is kept twice) or replaces everything on that device. Older plain `.json` backups still import. A small card on the home screen suggests a backup after 3 finished writings or 14 days.
- **Corrected texts:** every writing remembers a fingerprint of the text it was written against; if the library text is later corrected, opening the writing says so (your strokes are never moved or deleted).
- Settings auto-save.
- Every text has Traditional and Simplified forms you can switch between. The UI itself is in Traditional Chinese.

---

## Library

**85 texts, 14 categories, 751 sections, 109,349 characters** (`library/index.json`, version 3). All public domain, split by section, with progress tracked per section. The 心經 is in there, of course.

| Category | Texts | Chars | Examples |
|---|---:|---:|---|
| Buddhist 佛經 | 6 | 9,834 | 心經、金剛經、阿彌陀經、普門品、大悲咒 |
| Daoist 道家 | 2 | 5,883 | 道德經、常清靜經 |
| Primers 蒙學 | 3 | 3,142 | 千字文、三字經、弟子規 |
| Confucian 儒典 | 3 | 21,240 | 大學、中庸、論語 |
| Prose 古文 | 42 | 20,712 | 蘭亭集序、陋室銘、愛蓮說、前後赤壁賦、岳陽樓記、出師表 |
| Poetry 詩 | 5 | 10,605 | 唐詩精選、千家詩精選、古詩十九首、漢魏樂府古詩選 |
| Ci 詞 | 1 | 2,454 | 宋詞精選 |
| Stele rubbings 碑帖名篇 | 4 | 3,871 | 九成宮醴泉銘、玄秘塔碑、大唐三藏聖教序、曹全碑 |
| Calligraphy classics 法帖書論 | 4 | 4,233 | 書譜、祭姪文稿、黃州寒食詩帖、蜀素帖（節選） |
| Small kai 小楷 | 4 | 3,455 | 樂毅論、孝經、東方朔畫贊、曹娥碑 |
| Shijing & Chuci 詩經楚辭 | 2 | 13,063 | 詩經精選、楚辭精選 |
| Qu 曲 | 1 | 550 | 元曲小令 |
| Family maxims 家訓格言 | 3 | 9,007 | 朱子家訓、增廣賢文、菜根譚（前集選） |
| Basics 基礎練習 | 5 | 1,300 | 永字八法、基本筆畫例字、常用字前 500、偏旁部首例字、基礎詞語 |

- **Source:** transcribed from [zh.wikisource.org](https://zh.wikisource.org); each text file's `source` field records the page.
- **Scripts:** Traditional is the script of record. Simplified is derived with OpenCC `t2s` and checked character by character.
- **Editorial rules:** no prefaces, commentary, footnotes or headers; variant glyphs normalised to standard forms; texts that couldn't be verified (some stele rubbings, for instance) are left out.
- **Basics** are character lists, not source texts. The common-character list follows the 《通用規範漢字表》 tier-1 numbering (stroke-count order), not frequency.

### Invariants

1. `body.trad` and `body.simp` match one-to-one in length, CJK character count and punctuation positions (the app aligns cells by character index).
2. Body text has only CJK characters and full-width punctuation `，。、；：？！「」『』《》` (plus a few `（）—·`). No line breaks, annotations, page numbers or wiki markup, no characters outside the BMP, and it ends on sentence-final punctuation.
3. Section `id`s are **never renamed** once published (saved progress is keyed on them).
4. `index.json`'s `version` is an integer and **goes up on every content change**. `chars` / `sections` must match reality.

### Format

`library/index.json`: `{ version, categories: [{id, title:{trad,simp}}], texts: [{id, category, title, author, dynasty, file, chars, sections, description}] }`

`library/texts/<id>.json`:

```json
{
  "id": "example-text",
  "title":   {"trad": "題", "simp": "题"},
  "author":  {"trad": "作者", "simp": "作者"},
  "dynasty": {"trad": "唐", "simp": "唐"},
  "source":  "https://zh.wikisource.org/wiki/...",
  "license": "Public domain (text); transcription from <source>",
  "notes":   "edition, what was left out, editorial choices",
  "sections": [
    {"id": "main", "title": {"trad": "", "simp": ""},
     "body": {"trad": "…。", "simp": "…。"}}
  ]
}
```

Single-section works use the section id `main`; longer ones use stable short ids (`ch01`, `pian01`, pinyin slugs for poems). Optional notes live in `library/notes/<textId>.json`: `{id, version, disclaimer, sections: {<sectionId>: {summary, translation, keyLines, glossary, background}}}`, every field as `{trad, simp}`. For examples, see [`library/index.json`](library/index.json) and [`library/texts/heart-sutra.json`](library/texts/heart-sutra.json).

### Propose a new text

Open an Issue or a Pull Request with the title, author and dynasty, a link to the public-domain source page (zh.wikisource or similar) and the category you'd like. For a PR, a Traditional body is enough; Simplified can be derived with OpenCC. Please check it against the invariants above.

This repo is generated from a private source repository, so accepted PRs are merged into the source by hand and republished. You'll be credited in the commit log or acknowledgements, though this repo's history may not preserve your commit verbatim.

---

## Privacy

- What you write **stays on your device** (IndexedDB, with localStorage as fallback). No accounts, ads, tracking or backend.
- One anonymous **visit count** per app start via [GoatCounter](https://www.goatcounter.com/) (no cookies, nothing personal), just so I know whether it's worth putting effort into keeping this maintained. Skipped with Do Not Track.
- The network is used only to: (1) load the web app and fonts, plus the visit count above; (2) check for APK updates (GitHub Releases API, at most once a day or on demand); (3) check for library updates (reads `library/index.json` and shows 「字帖庫有更新」; you choose whether to download).
- Backups are your job: 設定 → 資料 → 匯出完整備份.

---

## Device notes & FAQ

### iReader Smart 6C Pro (measured)
- 10.3" Kaleido 3, EMR pen; WebView Chrome 113, Android 14. Pen reports pressure 0.094 to 1 and tilt about ±38°; no eraser button.
- Fast refresh modes (極速 / 快刷) binarise light greys, so keep the default **e-ink** screen type (black dotted grid).
- Ghosting: press **refresh** in the toolbar.
- The bottom ~1/10 cell of the screen sometimes loses the pen. **Edge margins** (default 3.5 % bottom) work around it; tune in 設定, or measure your device with 筆測 → 邊緣測試.
- Run **筆測 → 校準** on first use.

### FAQ

**"App not installed" during install?** An APK signed with a different key (a test build, say) is already there. Uninstall it first, but uninstalling erases its data, so export a backup before.

**Update button does nothing?** On first use, allow "install unknown apps" for the app: it jumps to the settings page, then come back and tap 更新 again. Or tap 「用瀏覽器下載」 to install by hand.

**White screen or "can't start WebView"?** Android System WebView is disabled or missing. Enable or update it in system settings.

**Where do exports go?** APK: `Download/墨/` (Android 9 and below need storage permission first). Web: your browser's downloads.

**Web and app progress differ?** They store data separately. Move it with 設定 → 資料 → 匯出完整備份 / 匯入備份 (合併).

**Ink vanished on iPhone?** Safari probably cleared a plain tab's site data. Add to Home Screen and back up regularly.

**No stroke order for a character?** It isn't in hanzi-writer-data (usually a rare variant).

**Template shows in a different font?** The selected font lacks that character, so it fell back to the next one.

---

## Nerdy bits

This is the **publishing repo**: the built app, the open library and the Android packaging source. Development happens in a private repo (my messy workspace :) ) and this one is generated from it wholesale, so don't expect uncompiled dev source.

```
/                    GitHub Pages root = web version: index.html, css/, js/ (plain ES2017, no framework),
                     sw.js, manifest.webmanifest, icon*.png / icon.svg
download/            download page (install steps, licenses and credits)
library/             open library: index.json, texts/, notes/ (+ manifest), strokes/ (+ LICENSE),
                     fonts/ (subsets + licence texts)
apk-www/             same code as the web version (no service worker), copied into the WebView shell at build time
android/             Android WebView shell source (Gradle, Java; package com.chitintim.moxie) + ci/ scripts
.github/workflows/   build-apk.yml: builds and signs the APK on tag push
.nojekyll
```

**Releasing:** push an annotated `vMAJOR.MINOR.PATCH` tag (its message becomes the release notes). GitHub Actions runs `assembleRelease`, signs with the fixed key, verifies with `apksigner`, then creates or updates that tag's Release with **`moxie.apk`** (marked latest). `versionCode = major×10000 + minor×100 + patch`, so a new version always installs over an old one. The signing key lives in no repository. Details in [`android/README.md`](android/README.md).

---

## Licenses & credits

| Item | License |
|---|---|
| **App code** | All rights reserved for now; license to be decided by the author. |
| **Texts** | Classical originals are public domain, transcribed from zh.wikisource (whose site content has its own CC BY-SA terms, see [zh.wikisource.org](https://zh.wikisource.org)). Each text file's `source` and `license` fields record provenance. |
| **Notes** (`library/notes/`) | AI-assisted, drawing on standard commentaries, for study only (stated in the files). License: **TBD by the author**. |
| **文鼎 PL 中楷** AR PL UKai | Arphic Public License, (c) 1999 Arphic Technology Co., Ltd. Modified (reduced subset, renamed MoUKai). Source: [freedesktop.org CJKUnifonts](http://www.freedesktop.org/wiki/Software/CJKUnifonts). License text: `library/fonts/ARPHICPL.txt` |
| **全字庫正楷體** TW-Kai | Taiwan Ministry of Digital Affairs; dual-licensed (Open Government Data License v1 / SIL OFL 1.1). Used here under **SIL OFL 1.1**: `library/fonts/OFL-TWKai.txt` |
| **馬善政** Ma Shan Zheng | SIL OFL 1.1, (c) 2018 The Ma Shan Zheng Project Authors: `library/fonts/OFL-MaShanZheng.txt` |
| **霞鶩文楷** LXGW WenKai | SIL OFL 1.1, (c) the LXGW WenKai Project Authors. Renamed MoKai TC / MoKai SC as OFL requires: `library/fonts/OFL.txt` |
| **Stroke data** | [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) 2.0.1, from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi); outlines come from an Arphic font (AR PL KaitiM) and are distributed under the **Arphic Public License**. Modified (only `strokes` and `medians` kept, repacked in chunks): `library/strokes/LICENSE` |

Fonts are subsets with only the needed characters, renamed MoUKai / MoTWKai / MoMaShan / MoKai, with their license texts shipped in `library/fonts/`.

---

## Changelog

From the [Releases](https://github.com/chitintim/chinese-handwriting-app/releases) tags.

- **v0.6.1** Phone layout (one character at a time, finger width by speed, context strip, auto-advance). iPad + Apple Pencil support (hover ignored, palm rejection, Safari gestures blocked, Add to Home Screen prompt, 一般螢幕 display mode). PWA icons.
- **v0.6.0** Bookshelf home (continue / favourites / library, search, sort). Library grows to 85 texts in 14 categories (new: 法帖書論, 小楷, 碑帖, 詩經楚辭, 元曲, 家訓格言, 基礎練習). Per-section notes and side-by-side mode. Animated stroke order via finger double-tap or button. Grouped, auto-saving settings. Brush back to the 0.5.1 feel (毛筆 fine as default, 經典 preset), unified width / pressure range, 3-step calibration. UI font fix.
- **v0.5.3** Fix release: reverts to the v0.5.1 brush (removes the thin tail added in 0.5.2).
- **v0.5.2** More realistic 毛筆 (S-curve pressure, 頓筆, trailing tail, speed thinning). New tuning panel, custom presets and parameter copy.
- **v0.5.1** 秀麗筆 (soft tip, the default then) and medium-fine line width. Adaptive wider pressure range and calibration. Signature in settings. Traceable title and 落款 (date + signature).
- **v0.5.0** 33-text library (佛經 / 道家 / 蒙學 / 儒典 / 古文 / 詩 / 詞 / 碑帖) split into sections. Custom texts. 毛筆 ink engine (pressure curve, tilted tip, finishing stroke, smoothing, lower latency). In-app update check and install. Merged long-image export. Larger default glyphs.
- **v0.1.0 – v0.4.0** Early releases: web version and Android APK, download page, font choice, grid and e-ink fast-refresh fixes (v0.3.1), edge margins (v0.4.0).
