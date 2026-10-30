Template fonts of the Mo app (subsets, only the glyphs used; all renamed; regenerate with scripts/build.py).
Every font is split into woff2 files named <Font>[-NN]-<hash>.woff2; fonts.css declares one @font-face per file with a unicode-range, so a page only
downloads the chunks holding the characters it shows. The default font (MoUKai) covers the library plus GB2312 and Big5 (about 16000 characters),
so custom texts render too; the others hold the library characters only (a missing character falls back to the next font per character).
* MoUKaiTC / MoUKaiSC: AR PL UKai TW / CN (文鼎 PL 中楷), (c) 1999 Arphic Technology Co., Ltd., Arphic Public License
  (ARPHICPL.txt). Modified (subset, renamed); source: http://www.freedesktop.org/wiki/Software/CJKUnifonts
* MoTWKai: TW-Kai 全字庫正楷體, Ministry of Digital Affairs Taiwan (https://data.gov.tw/dataset/5961), used under the SIL OFL 1.1 (OFL-TWKai.txt).
* MoMaShan: Ma Shan Zheng 馬善政, (c) 2018 The Ma Shan Zheng Project Authors, SIL OFL 1.1 (OFL-MaShanZheng.txt).
* MoKai TC / MoKai SC: LXGW WenKai TC / WenKai (Regular, v1.530, https://github.com/lxgw/LxgwWenKai), (c) the LXGW WenKai
  Project Authors, SIL OFL 1.1 (OFL.txt); renamed "MoKai TC" / "MoKai SC" as required by the OFL for modified versions.
Library characters without a glyph in ANY bundled font (drawn by the system's CJK font): trad [] simp []
fonts.json lists the files per font and script, the library characters each lacks ("full": false => the app falls back per character).
