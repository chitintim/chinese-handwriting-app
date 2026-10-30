Template fonts of the Mo app (subsets, only the glyphs used; all renamed; regenerate with scripts/build.py):
* MoUKaiTC.woff2 / MoUKaiSC.woff2: AR PL UKai TW / CN (文鼎 PL 中楷), (c) 1999 Arphic Technology Co., Ltd., Arphic Public License
  (ARPHICPL.txt). Modified (subset, renamed); source: http://www.freedesktop.org/wiki/Software/CJKUnifonts
* MoTWKai.woff2: TW-Kai 全字庫正楷體, Ministry of Digital Affairs Taiwan (https://data.gov.tw/dataset/5961), used under the SIL OFL 1.1 (OFL-TWKai.txt).
* MoMaShan.woff2: Ma Shan Zheng 馬善政, (c) 2018 The Ma Shan Zheng Project Authors, SIL OFL 1.1 (OFL-MaShanZheng.txt).
* MoKaiTC.woff2 / MoKaiSC.woff2: LXGW WenKai TC / WenKai (Regular, v1.530, https://github.com/lxgw/LxgwWenKai), (c) the LXGW WenKai
  Project Authors, SIL OFL 1.1 (OFL.txt); renamed "MoKai TC" / "MoKai SC" as required by the OFL for modified versions.
fonts.json lists the subset files, the library characters each lacks ("full": false => the app falls back per character).
