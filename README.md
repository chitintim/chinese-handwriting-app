# 墨字帖 Mòzìtiè

## Hey guys, it's Tim 👋

I vibe-coded this while spending a lot of time sitting with my mom in hospital.

She's been a devoted Buddhist for a very long time (皈依 many years ago), and 抄心經 is something close to her heart. Me? I wouldn't call myself a Buddhist — more someone slowly learning about it. This gave me something calm to do with my hands (and my brain) while I'm here.

It started as “I just want a nice way to 抄心經 on my e-ink tablet”. One sutra, simple.

Then my ADHD brain and Claude got involved. A couple of days later there's a full on library, a brush engine that reads pen pressure and tilt, stroke-order animations, 解說, a scroll-style export, a phone mode… 😅 Thanks, Claude. (Also: sorry, Claude.)

Add it to the pile of my countless half finished vibe-coding projects — except this one I actually use.

Funny thing about that tablet: the iReader was actually a gift for Mom a few months ago, back when she could still read. She'd mentioned long reads were getting hard, and I thought an e-ink tablet might help. Now it's the thing I 抄經 on, sitting next to her.

嗨，我是 Tim。這個小工具，是我在醫院陪媽媽的日子裡慢慢做出來的。媽媽是虔誠的佛教徒，很多年前已經皈依；我自己不算是佛教徒，只是在慢慢學習。抄抄經、寫寫字，讓我在這裡的時間多了一份安靜。這部 iReader，本來是幾個月前買給媽媽看書用的；現在，它陪我在她身邊抄經。本來只想好好抄一篇《心經》，結果一不小心越做越大……（謝謝 Claude 😅）

*For Mom.* 🙏

### If this is useful to you 隨喜 🙏

It's free and always will be. If you'd like to give something back, please donate to one of these instead — not to me:

- **[Dana-Farber Cancer Institute](https://danafarber.jimmyfund.org/site/Donation2?df_id=10522&mfc_pref=T&10522.donation=form1)** (Boston) — Mom has been fighting ovarian cancer, and we spent a couple of months at Dana-Farber. The people there are incredible. On that form you can direct your gift to the **Gynecologic Oncology Program** (which covers ovarian cancer).
- **[西方寺 Western Monastery](https://www.wm.org.hk/%E7%B7%9A%E4%B8%8A%E5%8A%9F%E5%BE%B7)** (荃灣, Hong Kong) — where Mom spent so much of her time 禮佛, back when she could still go. Online 功德 is on their site, or call (852) 2411 5111.

---

## 這是什麼 What is this?

**抄經、臨帖的描紅練習 App，為 iReader Smart 6C Pro 等電子墨水平板而設計；手機、iPad + Apple Pencil 與瀏覽器也能用。**
*Tracing and copying practice for Chinese calligraphy and sutra copying (抄經 / 臨帖), made for e-ink tablets like the iReader Smart 6C Pro. It also runs on phones, iPad + Apple Pencil and in any modern browser.*

每個格子裡有一個淺灰色的楷書字，像描紅紙一樣，你用筆（或手指）一筆一筆描成黑色。沒有帳號、沒有廣告、不上傳你的字。簡單。
*A light-grey kai-script glyph sits in every cell like tracing paper, and you trace it in black ink. No accounts, no ads, nothing uploaded. Simple.*

```
+-------+-------+
| \     |     / |        A 米字格 cell: the grey template character
|   \   |   /   |        sits in the middle. In e-ink mode the guide
|     \ | /     |        lines are black dots, so they survive the
+-------+-------+        fast refresh modes.
|     / | \     |
|   /   |   \   |
| /     |     \ |
+-------+-------+

直書 (columns run right to left):
  左 <---------------------------------------- 右
  [落款 / 印]  [... 第三行] [第二行] [第一行]  [標題]
```

**目錄 Contents:**
[怎麼拿到 How to get it](#怎麼拿到-how-to-get-it) ·
[它能做什麼 What it does](#它能做什麼-what-it-does) ·
[文庫裡有什麼 What's in the library](#文庫裡有什麼-whats-in-the-library) ·
[私隱 Privacy](#私隱-privacy) ·
[裝置提示與常見問題 Device notes & FAQ](#裝置提示與常見問題-device-notes--faq) ·
[書呆子細節 Nerdy bits](#書呆子細節-nerdy-bits-repo--releases) ·
[授權與致謝 Licenses & credits](#授權與致謝-licenses--credits) ·
[版本紀錄 Changelog](#版本紀錄-changelog)

---

## 怎麼拿到 How to get it

| 裝置 Device | 怎麼用 How |
|---|---|
| Android / 電子墨水平板 (e-ink) | 安裝 APK，見下 |
| iPhone / iPad | 用 Safari 開網頁版，**加入主畫面** |
| 電腦或任何瀏覽器 | 開網頁版 |

### 安裝 APK (Android) Install the APK

1. 下載 Download: **<https://github.com/chitintim/chinese-handwriting-app/releases/latest/download/moxie.apk>**
   (所有版本 all versions: [Releases](https://github.com/chitintim/chinese-handwriting-app/releases)；安裝說明頁 install page: <https://chitintim.github.io/chinese-handwriting-app/download/>)
2. 打開下載的檔案。若系統詢問，請允許瀏覽器或檔案管理員「安裝未知來源」(未知來源) 的 App，再按「安裝」。
   *Open the file; if asked, allow installing from unknown sources for your browser or file manager, then tap Install.*
3. 之後有新版時，App 自己會提示：**設定 → 檢查更新**（啟動時每天最多自動檢查一次）。按「更新」即可下載並安裝，覆蓋舊版並保留所有資料。
   *Updates: the app checks GitHub for a newer release (at most once a day, or from 設定 → 檢查更新) and can download and install it itself. A newer APK installed over the old one keeps all data.*

需要 Android 7.0 (API 24) 或以上，並要有 Android System WebView。*Needs Android 7.0+ and the system WebView.*
APK 完全離線可用。*The APK works fully offline.*

### 網頁版 Web version

**<https://chitintim.github.io/chinese-handwriting-app/>**

第一次開啟後可離線使用（service worker 快取）。有新版時，主畫面會出現「有新版本」卡片，按「重新載入以更新」；不會自動重新載入，所以不會丟失筆跡。
*Works offline after the first visit. When a new version is published an "update available" card appears on the home screen; nothing reloads by itself, so no ink is lost.*

### iPhone / iPad

- 沒有 App Store 版本，請用 **Safari** 開網頁版。*There is no App Store app; use the web version in Safari.*
- **請「加入主畫面」** (分享鈕 → 加入主畫面) 並從桌面圖示開啟。原因：Safari 對一般網頁分頁，約 7 天沒開啟就可能清除網站資料（包括你的筆跡）；加入主畫面的網頁 App 不受此限。App 也會提醒你一次。
  *Add to Home Screen (Share button → 加入主畫面) and open it from the icon. Safari may delete a plain tab's site data after about 7 days without a visit; a Home Screen web app is exempt. The app reminds you once.*
- 仍建議定期備份：**設定 → 資料 → 匯出**。*Still back up now and then: 設定 → 資料 → 匯出.*
- iPad + Apple Pencil 使用平板版面，支援筆壓與傾斜；螢幕類型請設為 **一般螢幕** (淺灰實線格，設定 → 顯示 → 螢幕類型)。
  *iPad + Apple Pencil uses the tablet layout with pressure and tilt; set 螢幕類型 to 一般螢幕 (light-grey solid grid).*

### 手機 Phones

螢幕短邊小於 520 px 時自動切換為**手機版面**（或 設定 → 顯示 → 版面 → 手機）：一次只寫**一個字**，大格子 + 前後各 3 字的提示列 + 章節標題與進度，按鈕有 上一字 / 下一字 / 撤銷 / 清除 / 筆順 / 解說。可用手指或觸控筆寫；手指的筆畫粗細依書寫速度而定（慢＝粗）。寫完一字，稍候自動跳到下一字。
*On screens whose short side is under 520 px the app switches to a one-character-at-a-time layout. Finger strokes get their width from writing speed (slower = thicker). Ink is stored exactly as on the tablet layout, so one copy can be continued on a phone and a tablet (move data with 設定 → 匯出 / 匯入).*

### 資料不互通 Data stays separate

網頁版與 APK 的資料各自獨立（不同儲存空間）；要搬移請用 **設定 → 匯出 / 匯入**（整份備份）。
*The web app and the APK keep their data separately; move it with 設定 → 匯出 / 匯入.*

---

## 它能做什麼 What it does

### 描紅範本與字體 Tracing templates and fonts
- 三種練習模式：**描**（預設，描淺灰範本）、**臨**（對照小範本臨寫）、**默**（憑記憶默寫，可按「提示」）。*Modes: trace, copy from a small reference, write from memory with hints.*
- 四種範本字體 (設定 → 字體)：**楷書** 文鼎 PL 中楷 (預設，涵蓋文庫全部用字及 GB2312 / Big5，自訂文字也能顯示)、**正楷** 全字庫正楷體、**行楷** 馬善政、**硬筆** 霞鶩文楷。字體缺字時逐字退回下一種字體。
  *Four template fonts; a character a font lacks falls back per character.*
- 字大小 五級（小 0.60 / 中小 0.70 / 中 0.75 / 大 0.80 / 特大 0.90 倍格寬），六種格子大小（特大到特小）。*Five glyph sizes and six cell sizes.*
- 米字格 / 田字格，外框與格線可分開開關。**電子紙模式**的格線預設為黑色點線（極速 / 快刷模式會丟掉淺灰，淺灰線會消失）；描紅樣式可選 灰色 / 網點 (halftone) / 空心。**筆測 → 對比測試** 可看你的刷新模式實際顯示什麼。
  *Grid styles are e-ink safe: black dotted guides by default, because fast refresh modes drop light greys.*

### 毛筆與筆觸引擎 Brush engine
- 筆觸：**毛筆**（預設，細）、**經典**、**秀麗筆**、**硬筆**、**鋼筆**、**自訂**。*Brushes: 毛筆, 經典, 秀麗筆, 硬筆, 鋼筆, custom.*
- 讀取筆壓與傾斜；「粗細」是平常力道的線寬，「筆壓幅度」小 / 中 / 大決定力道能讓線變多粗。*Reads pressure and tilt; line width and pressure range are separate settings.*
- **校準筆壓** (筆測)：3 步，對應你的 輕 / 平常 / 重。**筆觸調校**面板有可複製的自訂參數 (複製參數)。*3-step pressure calibration; a tuning panel with a custom preset.*
- 筆測頁顯示筆實際回報的數值（筆壓、傾斜、事件頻率）與 **邊緣測試**。*The 筆測 page shows what your pen really reports.*

### 版面 Layout and page
- **直書**（由右至左）或 **橫書**。標題頁、迴向偈、歲次日期 / 姓名行（落款）可選；標點以小字置於格角。
- **標題與落款可描寫**：標題、日期與署名也有描紅格；署名與姓名可用於 **印章**。*Traceable title and 落款 (date + signature) cells; a seal can be made from your name.*
- 頁內撤銷、筆端橡皮擦（如果筆有橡皮擦鍵）、清頁、**刷新**（清殘影的整屏閃一下）、**自動翻頁**（寫滿一頁後 1 / 2 / 3 秒自動翻，預設 2 秒）。
- **邊緣留白**：避開筆在螢幕邊緣收不到訊號的區域（預設底部 3.5 %，左右與上方 1 %）。

### 書架 Bookshelf
首頁是書架：**繼續書寫**（進行中的抄本，一點就回到第一個空格）、**收藏**（☆ / ★，可收藏整部或單章）、**書庫**（分類、排序、搜尋）。每章有進度與完成次數；**新抄一遍**會封存目前這份（可唯讀瀏覽與匯出）。**自訂**可貼上自己的文字（只存在你的裝置，包含在備份內）。
*Home is a bookshelf: continue writing, favourites, library (categories, sort, search), per-section progress and tally, archived copies, and your own pasted texts.*

### 解說 Section notes
82 篇文庫文本附有逐章**解說**：要旨 / 白話 / 重點句 / 字詞 / 背景；寫完一章後自動顯示（可關閉）。**對照模式**可在寫字時於旁邊（橫向）或下方（直向）顯示要旨與字詞。解說為 AI 輔助撰寫，僅供學習參考。
*82 of the 85 texts have per-section notes (summary, plain-language translation, key lines, glossary, background). They are AI-assisted and for study only.*

### 筆順 Stroke order
**用手指雙擊格子**（設定 → 雙擊看筆順；僅限筆模式時，並有防手掌誤觸），或按工具列的 **筆順** 按鈕：彈出視窗以電子紙友善的粗略 4 步動畫顯示筆畫，附筆畫序號與方向箭頭，可 重播 / 逐筆 / 調速。資料來自 hanzi-writer-data，依**大陸標準**，部分繁體字可能與臺灣標準不同；少數罕見字（多為詩經、楚辭異體字）沒有資料，會顯示「找不到筆順資料」。
*Double-tap a cell with a finger, or press the 筆順 button, for an animated stroke-order popup. Order follows the dataset (mainland standard), which can differ from the Taiwan standard; a few rare characters have no data.*

### 匯出作品 Export
寫完當然想留個紀念。匯出不是把螢幕頁面硬接起來，而是把整篇字**重新排版**成一件成品：
- 格式：**單張**、**手卷**（直書長橫幅）、**分頁**（每頁一張 PNG，或一份 **PDF**）、分頁可選 **合併長圖**（直書由右至左並排，橫書由上而下）。
- 宣紙或白紙；朱絲欄 / 烏絲欄 / 米字格 / 無；標題、落款（干支或公元日期 + 敬書 / 恭錄 / 沐手敬書）、迴向、**印章**。
- 可由目前或任一封存的抄本匯出；單邊最大 8192 px、最多約 16 MP。*Export re-flows the whole text; single sheet, handscroll, paged PNG/PDF, merged long image; paper, rules, 落款, seal.*

### 其他 Also
- **離線**：APK 與（首次載入後的）網頁版皆可離線，不需要網路就能寫。*Offline.*
- **備份**：設定 → 資料 → 匯出 / 匯入，一個 JSON 檔包含所有抄本、收藏、設定；匯入會取代該裝置上的所有資料。*One JSON backup file; importing replaces everything on that device.*
- 設定自動儲存，分組並有索引。*Settings auto-save.*
- 每篇文本都有繁體、簡體兩種字形，可切換；介面本身是繁體中文。*Every text exists in both Traditional and Simplified; the UI itself is Traditional Chinese.*

---

## 文庫裡有什麼 What's in the library

先講重點：**85 篇文本、14 個分類、751 章、合計 109,349 字**（`library/index.json`，版本 3）。全部是公有領域的古典文本，按章拆開，進度也按章記錄。心經當然在裡面。
*85 texts in 14 categories, 751 sections, 109,349 CJK characters in total (index version 3).*

| 分類 Category | 篇數 Texts | 字數 Chars | 例 Examples |
|---|---:|---:|---|
| 佛經 | 6 | 9,834 | 心經、金剛經、阿彌陀經、普門品、大悲咒 |
| 道家 | 2 | 5,883 | 道德經、常清靜經 |
| 蒙學 | 3 | 3,142 | 千字文、三字經、弟子規 |
| 儒典 | 3 | 21,240 | 大學、中庸、論語 |
| 古文 | 42 | 20,712 | 蘭亭集序、陋室銘、愛蓮說、前後赤壁賦、岳陽樓記、出師表 |
| 詩 | 5 | 10,605 | 唐詩精選、千家詩精選、古詩十九首、漢魏樂府古詩選 |
| 詞 | 1 | 2,454 | 宋詞精選 |
| 碑帖名篇 | 4 | 3,871 | 九成宮醴泉銘、玄秘塔碑、大唐三藏聖教序、曹全碑 |
| 法帖書論 | 4 | 4,233 | 書譜、祭姪文稿、黃州寒食詩帖、蜀素帖（節選） |
| 小楷 | 4 | 3,455 | 樂毅論、孝經、東方朔畫贊、曹娥碑 |
| 詩經楚辭 | 2 | 13,063 | 詩經精選、楚辭精選 |
| 曲 | 1 | 550 | 元曲小令 |
| 家訓格言 | 3 | 9,007 | 朱子家訓、增廣賢文、菜根譚（前集選） |
| 基礎練習 | 5 | 1,300 | 永字八法、基本筆畫例字、常用字前 500、偏旁部首例字、基礎詞語 |

- 來源：文本轉錄自 [zh.wikisource.org](https://zh.wikisource.org)，每個文本檔的 `source` 欄記錄所用頁面。*Transcribed from zh.wikisource; each text file records its source page.*
- 正本為繁體，簡體由 OpenCC `t2s` 轉換並逐字檢查。*The script of record is Traditional; Simplified is derived with OpenCC.*
- 編輯原則：序、注、腳註、版頭一律不收；異體字、碑別字統一為通行字；無法核對的文本（例如部分碑帖）寧缺不收。*Prefaces, commentary and footnotes are left out; variant glyphs are normalised; texts that could not be verified are not included.*
- 基礎練習屬字表，不是原文；其中「常用字」按《通用規範漢字表》一級字表的序號（即筆畫序），不是頻率序。*The 基礎練習 sets are character lists, not source texts; the common-character list follows the 通用規範漢字表 order (by stroke count), not frequency.*

### 不變條件 Invariants

1. `body.trad` 與 `body.simp` 的長度、漢字數與標點位置**完全一一對應**（App 按字序號對格子）。*Same length, same CJK count and punctuation positions in both scripts.*
2. 內文只含漢字與全形標點 `，。、；：？！「」『』《》`（及少數 `（）—·`）；無換行、註記、頁碼、wiki 標記，不含 BMP 以外的字元，且以句末標點結尾。
3. 章節 `id` 一旦發佈**永不改名**（它是已存進度的鍵）。*Section ids are never renamed once published.*
4. `index.json` 的 `version` 為整數，**內容每次改變都要加一**；`chars` / `sections` 必須與實際相符。

### 格式 Format (summary)

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

單章作品的章節 id 用 `main`；長篇用穩定的短識別碼（`ch01`、`pian01`、詩的拼音 slug 等）。可選的解說檔 `library/notes/<textId>.json`：`{id, version, disclaimer, sections: {<sectionId>: {summary, translation, keyLines, glossary, background}}}`，每個欄位都有 `{trad, simp}`。範例請直接看 [`library/index.json`](library/index.json) 與 [`library/texts/heart-sutra.json`](library/texts/heart-sutra.json)。

### 提議新文本 Propose a new text

歡迎透過 **Issue** 或 **Pull Request** 提議：請附上文本名稱、作者朝代、**zh.wikisource（或其他公有領域來源）頁面連結**，以及你想放在哪個分類。若你直接寫 JSON，只需提供**繁體**正文，簡體可由 OpenCC 產生；請確認符合上面的不變條件。
*Open an Issue or a Pull Request with the title, author/dynasty, a link to the public-domain source page and the category. For a PR, a Traditional body is enough; Simplified is derived with OpenCC.*

注意：這個倉庫的內容是由私人的原始碼倉庫**生成並覆蓋發佈**的，所以被接受的 PR 會由作者手動併入原始碼再重新發佈（你的貢獻會保留署名在提交紀錄或致謝中，但本倉庫的提交歷史不一定逐字保留）。
*This repo is generated from a private source repository, so accepted PRs are merged by hand into the source and republished.*

---

## 私隱 Privacy

- 你寫的字**只存在你的裝置上**（IndexedDB，備用 localStorage）。沒有帳號、沒有分析 / 追蹤、沒有廣告、沒有後端。
  *Everything you write stays on your device. No accounts, no analytics, no backend.*
- 網路只用於：(1) 網頁版載入程式與字體；(2) APK 的**更新檢查**（GitHub Releases API，每天至多一次或手動）；(3) 文庫同步（讀取 `library/index.json`，有新版時提示「字帖庫有更新」，由你按下載）。*The network is used only to load the web app, to check for updates, and to fetch library updates.*
- 因此備份靠你自己：設定 → 資料 → 匯出。*Backups are your responsibility.*

---

## 裝置提示與常見問題 Device notes & FAQ

### iReader Smart 6C Pro（實測 measured）
- 10.3" Kaleido 3，EMR 筆；WebView Chrome 113，Android 14。筆回報壓力 0.094 到 1、傾斜約 ±38°；沒有橡皮擦鍵。
- 快速刷新模式（極速 / 快刷）會把淺灰二值化：請使用預設的**電子紙**螢幕類型（黑色點線格）。想看清楚不同刷新模式顯示什麼：筆測 → 對比測試。
- 有殘影時按工具列的 **刷新**。
- 螢幕底部邊緣約 1/10 格的區域筆有時收不到：靠 **邊緣留白** (預設底部 3.5 %) 避開，可在 設定 調整，或用 筆測 → 邊緣測試 量出你的裝置有多近。
- 第一次使用建議先做 **筆測 → 校準**。

### 常見問題 FAQ

**安裝時顯示「App 未安裝」？** 可能已裝了不同簽名的版本（例如測試版）。先解除安裝舊版再裝；注意解除安裝會清除該 App 的資料，請先匯出備份。*An APK signed with another key is installed; uninstall it first (back up first).*

**更新按了沒反應？** 第一次需要允許此 App「安裝未知來源」：App 會跳到設定頁，允許後回來再按「更新」。也可按「用瀏覽器下載」手動裝。*Allow 'install unknown apps' for the app, then tap 更新 again; or download the APK by hand.*

**白畫面或「無法啟動 WebView」？** 裝置的 Android System WebView 被停用或缺失，請在系統中啟用 / 更新。

**匯出的檔案在哪裡？** APK 會存到 `Download/墨/`（Android 9 及以下要先允許儲存權限）；網頁版是瀏覽器下載。

**網頁版和 App 的進度不一樣？** 兩者資料各自獨立，請用 匯出 / 匯入 搬移。

**iPhone 的字不見了？** 可能是 Safari 清除了一般分頁的網站資料；加入主畫面並定期備份。

**某個字沒有筆順？** 該字不在 hanzi-writer-data 內（多為罕見異體字）。

**某個字顯示成別的字體？** 所選範本字體缺該字時會逐字退回下一種字體。

---

## 書呆子細節 Nerdy bits (repo & releases)

這是**發佈用倉庫**：建置好的 App、開放文庫與 Android 打包來源。日常開發在另一個私人倉庫（我的亂糟糟的工作區 :) ）進行，這裡是由腳本整份生成並覆蓋的，所以別期待看到未編譯的開發原始碼。
*This repo is the published build plus the open content library. Development happens in a private repository; this one is generated from it.*

```
/                    GitHub Pages 根目錄 = 網頁版: index.html, css/, js/ (純 ES2017 腳本, 無框架), sw.js,
                     manifest.webmanifest, icon*.png / icon.svg
download/            下載頁 (安裝步驟、授權與致謝)
library/             開放文庫: index.json, texts/ (原文), notes/ (解說 + manifest), strokes/ (筆順資料 + LICENSE), fonts/ (字體子集 + 授權文字)
apk-www/             與網頁版相同的程式 (沒有 service worker)，APK 建置時被複製進 WebView 外殼
android/             Android WebView 外殼原始碼 (Gradle, Java; 套件 com.chitintim.moxie) + ci/ 腳本
.github/workflows/   build-apk.yml: 打 tag 後建置並簽署 APK
.nojekyll
```

**發佈流程 Releasing:** 推送形如 `vMAJOR.MINOR.PATCH` 的 tag（附註 tag，其訊息即版本說明）→ GitHub Actions 建置 `assembleRelease`、用固定金鑰簽署、以 `apksigner` 驗證 → 建立 / 更新該 tag 的 Release，附上 **`moxie.apk`**（標為 latest）。`versionCode = major×10000 + minor×100 + patch`，所以新版一定能直接覆蓋舊版。簽署金鑰不在任何倉庫中。
*Push an annotated `vX.Y.Z` tag, GitHub Actions builds, signs and verifies the APK and attaches `moxie.apk` to the Release; the tag message becomes the release notes and the in-app update card.* 詳見 [`android/README.md`](android/README.md)。

---

## 授權與致謝 Licenses & credits

| 項目 Item | 授權 License |
|---|---|
| **App 程式碼** App code | 暫時保留所有權利，授權方式待作者決定。*All rights reserved for now; license to be decided by the author.* |
| **文本** Texts | 古典原文屬公有領域；轉錄自 zh.wikisource（該站內容另有其 CC BY-SA 網站條款，請見 [zh.wikisource.org](https://zh.wikisource.org)）。每個文本檔的 `source` 與 `license` 欄記錄出處。 |
| **解說** Notes (`library/notes/`) | AI 輔助撰寫，參考通行注疏，僅供學習參考（檔內有此聲明）。授權：**待作者決定 (license: TBD by the author)**。 |
| **文鼎 PL 中楷** AR PL UKai | Arphic Public License，(c) 1999 Arphic Technology Co., Ltd.；已修改（縮減子集、改名 MoUKai），原始碼 [freedesktop.org CJKUnifonts](http://www.freedesktop.org/wiki/Software/CJKUnifonts)；授權文字 `library/fonts/ARPHICPL.txt` |
| **全字庫正楷體** TW-Kai | 臺灣數位發展部；雙授權（政府資料開放授權條款第 1 版 / SIL OFL 1.1），本專案依 **SIL OFL 1.1** 使用；`library/fonts/OFL-TWKai.txt` |
| **馬善政** Ma Shan Zheng | SIL OFL 1.1，(c) 2018 The Ma Shan Zheng Project Authors；`library/fonts/OFL-MaShanZheng.txt` |
| **霞鶩文楷** LXGW WenKai | SIL OFL 1.1，(c) the LXGW WenKai Project Authors；依 OFL 改名為 MoKai TC / MoKai SC；`library/fonts/OFL.txt` |
| **筆順資料** Stroke data | [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) 2.0.1，源自 [Make Me a Hanzi](https://github.com/skishore/makemeahanzi)，輪廓取自 Arphic 字型 (AR PL KaitiM)，依 **Arphic Public License** 散布；已修改（只留 `strokes` 與 `medians`，重新分塊封裝）；`library/strokes/LICENSE` |

字體檔皆為只含所需字元的子集，已重新命名（MoUKai / MoTWKai / MoMaShan / MoKai）。*All fonts are renamed subsets with their licence texts shipped in `library/fonts/`.*

---

## 版本紀錄 Changelog

取自本倉庫的 [Releases](https://github.com/chitintim/chinese-handwriting-app/releases)。*From the release tags.*

- **v0.6.1** 手機版面（一次一字、手指筆跡依速度變粗細、前後文提示列、自動跳字）；iPad + Apple Pencil 支援（忽略懸停、防手掌誤觸、擋掉 Safari 手勢、加入主畫面提示、「一般螢幕」顯示模式）；PWA 圖示。
- **v0.6.0** 書架首頁（繼續書寫 / 收藏 / 書庫、搜尋、排序）；文庫擴至 85 篇 14 類（新增法帖書論、小楷、碑帖、詩經楚辭、元曲、家訓格言、基礎練習）；逐章解說與對照模式；手指雙擊或按鈕看動畫筆順；設定自動儲存並分組；筆觸回到 0.5.1 手感（毛筆·細 為預設，經典 預設組）、統一的粗細 / 筆壓幅度與 3 步校準；介面字體修正。
- **v0.5.3** 修正版：還原 v0.5.1 的筆觸（移除 0.5.2 加入的細尾）。
- **v0.5.2** 較寫實的毛筆（S 形筆壓曲線、頓筆、出鋒尾、速度變細）；新增筆觸調校面板、自訂預設與複製參數。
- **v0.5.1** 秀麗筆（軟尖，當時新預設）與中細線寬；自適應的更寬筆壓範圍與校準筆壓；設定中的署名；標題與落款（日期 + 署名）可描寫。
- **v0.5.0** 33 篇文庫（佛經 / 道家 / 蒙學 / 儒典 / 古文 / 詩 / 詞 / 碑帖）及分章；自訂文字；毛筆墨跡引擎（筆壓曲線、傾斜筆尖、收筆、平滑、較低延遲）；App 內檢查並安裝更新；合併長圖匯出；預設字更大。
- **v0.1.0 – v0.4.0** 早期版本：網頁版與 Android APK、下載頁、字體選擇、格線與電子紙快刷模式的修正 (v0.3.1)、邊緣留白 (v0.4.0)。
