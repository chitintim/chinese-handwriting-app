/* 墨 service worker (hosted web app only; never registered inside the APK).
   Two caches:
   * moxie-<version>: the app shell (html, css, js, manifest, icon, fonts.css), installed atomically from the network (cache:'reload'), cache-first.
     skipWaiting + clients.claim: a new version takes over at once; the page shows an "update available" card.
   * moxie-data: the library and the font chunks, which outlive app versions.
       - library/index.json, library/texts/*, fonts.json: stale-while-revalidate (answer from the cache, refresh it in the background);
       - library/fonts/*.woff2 (content-hashed names, each a unicode-range chunk): cache-first, filled at runtime as pages need them.
     CORE (the library index and the first chunk of every font) is precached so the first offline start works.
   Not cached: the download page (download/), the APK link (cross-origin), apk-www/ and android/ (not part of the app). */
var CACHE = 'moxie-6db93e9227';
var DATA = 'moxie-data';
var FILES = [
 "./",
 "css/app.css",
 "icon.svg",
 "index.html",
 "js/closing.js",
 "js/draw.js",
 "js/export.js",
 "js/form.js",
 "js/ink.js",
 "js/layout.js",
 "js/library.js",
 "js/main.js",
 "js/model.js",
 "js/pentest.js",
 "js/practice.js",
 "js/screens.js",
 "js/store.js",
 "js/update.js",
 "js/util.js",
 "library/fonts/fonts.css",
 "library/fonts/fonts.json",
 "manifest.webmanifest"
];
var CORE = [
 "library/index.json",
 "library/fonts/MoKaiSC-00-8d980989.woff2",
 "library/fonts/MoKaiTC-00-5d998d3c.woff2",
 "library/fonts/MoMaShan-00-999d296e.woff2",
 "library/fonts/MoTWKai-00-ca5b2e4e.woff2",
 "library/fonts/MoUKaiSC-00-2950cdfd.woff2",
 "library/fonts/MoUKaiTC-00-cc90b6e9.woff2"
];
var FONTS = [
 "library/fonts/MoKaiSC-00-8d980989.woff2",
 "library/fonts/MoKaiSC-01-1595ff24.woff2",
 "library/fonts/MoKaiSC-02-25f8454e.woff2",
 "library/fonts/MoKaiSC-03-5749c0a6.woff2",
 "library/fonts/MoKaiSC-04-6a68311f.woff2",
 "library/fonts/MoKaiSC-05-a6509633.woff2",
 "library/fonts/MoKaiSC-06-2d6b410b.woff2",
 "library/fonts/MoKaiSC-07-5bb23343.woff2",
 "library/fonts/MoKaiSC-08-0a3abb8f.woff2",
 "library/fonts/MoKaiSC-09-7097055a.woff2",
 "library/fonts/MoKaiSC-10-2edb6ae9.woff2",
 "library/fonts/MoKaiSC-11-52fcd852.woff2",
 "library/fonts/MoKaiSC-12-f2657fd9.woff2",
 "library/fonts/MoKaiSC-13-59236f04.woff2",
 "library/fonts/MoKaiSC-14-f1ef1ff4.woff2",
 "library/fonts/MoKaiSC-15-195daa67.woff2",
 "library/fonts/MoKaiTC-00-5d998d3c.woff2",
 "library/fonts/MoKaiTC-01-4ad05183.woff2",
 "library/fonts/MoKaiTC-02-79f2fdaf.woff2",
 "library/fonts/MoKaiTC-03-6cb75472.woff2",
 "library/fonts/MoKaiTC-04-c8056b72.woff2",
 "library/fonts/MoKaiTC-05-d4dd36fb.woff2",
 "library/fonts/MoKaiTC-06-5a42ff8c.woff2",
 "library/fonts/MoKaiTC-07-7e6f73bb.woff2",
 "library/fonts/MoKaiTC-08-b4965cc1.woff2",
 "library/fonts/MoKaiTC-09-292e43cb.woff2",
 "library/fonts/MoKaiTC-10-61023a5b.woff2",
 "library/fonts/MoKaiTC-11-6b27f135.woff2",
 "library/fonts/MoKaiTC-12-0604131f.woff2",
 "library/fonts/MoKaiTC-13-6b4162f4.woff2",
 "library/fonts/MoKaiTC-14-214201aa.woff2",
 "library/fonts/MoKaiTC-15-4409af4d.woff2",
 "library/fonts/MoKaiTC-16-f3a5d087.woff2",
 "library/fonts/MoKaiTC-17-9a70c0b6.woff2",
 "library/fonts/MoKaiTC-18-b897ee9a.woff2",
 "library/fonts/MoKaiTC-19-d3f8c184.woff2",
 "library/fonts/MoKaiTC-20-892c73f8.woff2",
 "library/fonts/MoMaShan-00-999d296e.woff2",
 "library/fonts/MoMaShan-01-d7108ea8.woff2",
 "library/fonts/MoMaShan-02-9468f1b2.woff2",
 "library/fonts/MoMaShan-03-42300d1d.woff2",
 "library/fonts/MoMaShan-04-7b887b47.woff2",
 "library/fonts/MoMaShan-05-bd9a0f1c.woff2",
 "library/fonts/MoMaShan-06-ae508dd7.woff2",
 "library/fonts/MoMaShan-07-ad58f14c.woff2",
 "library/fonts/MoMaShan-08-9924e64e.woff2",
 "library/fonts/MoMaShan-09-98571cf2.woff2",
 "library/fonts/MoMaShan-10-cd473dab.woff2",
 "library/fonts/MoMaShan-11-2f7a20fe.woff2",
 "library/fonts/MoMaShan-12-17d3b88f.woff2",
 "library/fonts/MoMaShan-13-29a26ef3.woff2",
 "library/fonts/MoMaShan-14-be674b7a.woff2",
 "library/fonts/MoMaShan-15-82af245c.woff2",
 "library/fonts/MoMaShan-16-2a5dc92f.woff2",
 "library/fonts/MoMaShan-17-6612fcae.woff2",
 "library/fonts/MoMaShan-18-65f3c98f.woff2",
 "library/fonts/MoMaShan-19-28917bf6.woff2",
 "library/fonts/MoMaShan-20-d1b4ec9d.woff2",
 "library/fonts/MoMaShan-21-17724674.woff2",
 "library/fonts/MoMaShan-22-9342ddd0.woff2",
 "library/fonts/MoMaShan-23-6c10036a.woff2",
 "library/fonts/MoMaShan-24-beee3065.woff2",
 "library/fonts/MoMaShan-25-67035dbd.woff2",
 "library/fonts/MoMaShan-26-39c18d2e.woff2",
 "library/fonts/MoMaShan-27-6b0e411c.woff2",
 "library/fonts/MoTWKai-00-ca5b2e4e.woff2",
 "library/fonts/MoTWKai-01-9d81d91d.woff2",
 "library/fonts/MoTWKai-02-ebe20d89.woff2",
 "library/fonts/MoTWKai-03-15c0bda6.woff2",
 "library/fonts/MoTWKai-04-c91fce19.woff2",
 "library/fonts/MoTWKai-05-3effa023.woff2",
 "library/fonts/MoTWKai-06-dc17ac70.woff2",
 "library/fonts/MoTWKai-07-b98d32e0.woff2",
 "library/fonts/MoTWKai-08-e934d8ad.woff2",
 "library/fonts/MoTWKai-09-0ff09577.woff2",
 "library/fonts/MoTWKai-10-a66b8528.woff2",
 "library/fonts/MoTWKai-11-62bc8a1d.woff2",
 "library/fonts/MoTWKai-12-fe07ddc5.woff2",
 "library/fonts/MoTWKai-13-5ebd0247.woff2",
 "library/fonts/MoTWKai-14-2d17ab37.woff2",
 "library/fonts/MoTWKai-15-51eddac3.woff2",
 "library/fonts/MoTWKai-16-a04fd388.woff2",
 "library/fonts/MoTWKai-17-62597fe5.woff2",
 "library/fonts/MoTWKai-18-d3f53b79.woff2",
 "library/fonts/MoTWKai-19-a378ea63.woff2",
 "library/fonts/MoTWKai-20-3132d35e.woff2",
 "library/fonts/MoTWKai-21-31be3e7b.woff2",
 "library/fonts/MoTWKai-22-00f36712.woff2",
 "library/fonts/MoTWKai-23-adf8cfdd.woff2",
 "library/fonts/MoTWKai-24-41810543.woff2",
 "library/fonts/MoTWKai-25-e9d7de8d.woff2",
 "library/fonts/MoTWKai-26-51918cbe.woff2",
 "library/fonts/MoTWKai-27-3e2c342b.woff2",
 "library/fonts/MoTWKai-28-48bd4462.woff2",
 "library/fonts/MoTWKai-29-29c00993.woff2",
 "library/fonts/MoTWKai-30-7462aff7.woff2",
 "library/fonts/MoTWKai-31-4fef5990.woff2",
 "library/fonts/MoTWKai-32-16604048.woff2",
 "library/fonts/MoTWKai-33-d071210f.woff2",
 "library/fonts/MoTWKai-34-ccc35e33.woff2",
 "library/fonts/MoTWKai-35-501278a7.woff2",
 "library/fonts/MoTWKai-36-571fb28f.woff2",
 "library/fonts/MoTWKai-37-4806591e.woff2",
 "library/fonts/MoTWKai-38-7d0a172d.woff2",
 "library/fonts/MoTWKai-39-b647a16a.woff2",
 "library/fonts/MoTWKai-40-8982afc7.woff2",
 "library/fonts/MoTWKai-41-f4f6b4de.woff2",
 "library/fonts/MoTWKai-42-90341f74.woff2",
 "library/fonts/MoTWKai-43-e0028c1d.woff2",
 "library/fonts/MoTWKai-44-ecf7530f.woff2",
 "library/fonts/MoTWKai-45-5bb57a6e.woff2",
 "library/fonts/MoUKaiSC-00-2950cdfd.woff2",
 "library/fonts/MoUKaiSC-01-3973479a.woff2",
 "library/fonts/MoUKaiSC-02-70c72700.woff2",
 "library/fonts/MoUKaiSC-03-aa553941.woff2",
 "library/fonts/MoUKaiSC-04-dbba24b3.woff2",
 "library/fonts/MoUKaiSC-05-406a8f85.woff2",
 "library/fonts/MoUKaiSC-06-6b766d62.woff2",
 "library/fonts/MoUKaiSC-07-1eecc649.woff2",
 "library/fonts/MoUKaiSC-08-ac4a1edd.woff2",
 "library/fonts/MoUKaiSC-09-a52f1427.woff2",
 "library/fonts/MoUKaiSC-10-2ddaf162.woff2",
 "library/fonts/MoUKaiSC-11-4c57a211.woff2",
 "library/fonts/MoUKaiSC-12-a700bdaa.woff2",
 "library/fonts/MoUKaiSC-13-70b6a4dd.woff2",
 "library/fonts/MoUKaiSC-14-cae4d0c6.woff2",
 "library/fonts/MoUKaiSC-15-cadf5525.woff2",
 "library/fonts/MoUKaiSC-16-5cc5b354.woff2",
 "library/fonts/MoUKaiSC-17-656976f3.woff2",
 "library/fonts/MoUKaiSC-18-bd948a71.woff2",
 "library/fonts/MoUKaiSC-19-aed80629.woff2",
 "library/fonts/MoUKaiSC-20-030385d4.woff2",
 "library/fonts/MoUKaiSC-21-6554eb5f.woff2",
 "library/fonts/MoUKaiSC-22-ee304e6a.woff2",
 "library/fonts/MoUKaiSC-23-7e564c38.woff2",
 "library/fonts/MoUKaiSC-24-26dcd2a7.woff2",
 "library/fonts/MoUKaiSC-25-86395f1d.woff2",
 "library/fonts/MoUKaiSC-26-a9afadc3.woff2",
 "library/fonts/MoUKaiSC-27-5614fd12.woff2",
 "library/fonts/MoUKaiSC-28-ae8e0956.woff2",
 "library/fonts/MoUKaiSC-29-a2d04ba0.woff2",
 "library/fonts/MoUKaiSC-30-0e4d82e0.woff2",
 "library/fonts/MoUKaiSC-31-8c4f06be.woff2",
 "library/fonts/MoUKaiSC-32-09e191cd.woff2",
 "library/fonts/MoUKaiSC-33-b876bdaa.woff2",
 "library/fonts/MoUKaiSC-34-6fcf000a.woff2",
 "library/fonts/MoUKaiSC-35-704b800a.woff2",
 "library/fonts/MoUKaiSC-36-eb4cae33.woff2",
 "library/fonts/MoUKaiSC-37-ec0405b0.woff2",
 "library/fonts/MoUKaiSC-38-c98d6b96.woff2",
 "library/fonts/MoUKaiSC-39-31cfbfe5.woff2",
 "library/fonts/MoUKaiSC-40-599007d9.woff2",
 "library/fonts/MoUKaiSC-41-b72e93f8.woff2",
 "library/fonts/MoUKaiSC-42-6496cb1d.woff2",
 "library/fonts/MoUKaiSC-43-931b93a1.woff2",
 "library/fonts/MoUKaiSC-44-b1d7688d.woff2",
 "library/fonts/MoUKaiSC-45-97368c94.woff2",
 "library/fonts/MoUKaiSC-46-ffe2a728.woff2",
 "library/fonts/MoUKaiSC-47-65edf38d.woff2",
 "library/fonts/MoUKaiSC-48-b79a5774.woff2",
 "library/fonts/MoUKaiSC-49-876dfbe2.woff2",
 "library/fonts/MoUKaiSC-50-7c7748d9.woff2",
 "library/fonts/MoUKaiSC-51-f3b1389b.woff2",
 "library/fonts/MoUKaiSC-52-ba5e84b0.woff2",
 "library/fonts/MoUKaiSC-53-010515ee.woff2",
 "library/fonts/MoUKaiSC-54-d3cb123d.woff2",
 "library/fonts/MoUKaiSC-55-57144c23.woff2",
 "library/fonts/MoUKaiSC-56-2bde918d.woff2",
 "library/fonts/MoUKaiSC-57-efde2aea.woff2",
 "library/fonts/MoUKaiSC-58-1ae69c01.woff2",
 "library/fonts/MoUKaiSC-59-d58816b3.woff2",
 "library/fonts/MoUKaiSC-60-3e35f9c0.woff2",
 "library/fonts/MoUKaiSC-61-ff38bb48.woff2",
 "library/fonts/MoUKaiSC-62-110e2122.woff2",
 "library/fonts/MoUKaiSC-63-ccf6fb62.woff2",
 "library/fonts/MoUKaiSC-64-d478429c.woff2",
 "library/fonts/MoUKaiSC-65-d504c3de.woff2",
 "library/fonts/MoUKaiSC-66-a2124058.woff2",
 "library/fonts/MoUKaiSC-67-86b1c441.woff2",
 "library/fonts/MoUKaiSC-68-8431406c.woff2",
 "library/fonts/MoUKaiSC-69-b6f31046.woff2",
 "library/fonts/MoUKaiSC-70-e991e271.woff2",
 "library/fonts/MoUKaiSC-71-439ec25f.woff2",
 "library/fonts/MoUKaiSC-72-edc262f4.woff2",
 "library/fonts/MoUKaiSC-73-f100bf11.woff2",
 "library/fonts/MoUKaiSC-74-f28b874b.woff2",
 "library/fonts/MoUKaiSC-75-e189cab3.woff2",
 "library/fonts/MoUKaiSC-76-a29ad630.woff2",
 "library/fonts/MoUKaiSC-77-598c162f.woff2",
 "library/fonts/MoUKaiSC-78-0bf53c28.woff2",
 "library/fonts/MoUKaiSC-79-b4030dc4.woff2",
 "library/fonts/MoUKaiSC-80-f3f35a14.woff2",
 "library/fonts/MoUKaiSC-81-bf6e4395.woff2",
 "library/fonts/MoUKaiSC-82-6dea495b.woff2",
 "library/fonts/MoUKaiSC-83-bba89405.woff2",
 "library/fonts/MoUKaiSC-84-a54ae6b5.woff2",
 "library/fonts/MoUKaiSC-85-3f5fa167.woff2",
 "library/fonts/MoUKaiSC-86-f594711a.woff2",
 "library/fonts/MoUKaiSC-87-f1b54b0a.woff2",
 "library/fonts/MoUKaiSC-88-df1590cb.woff2",
 "library/fonts/MoUKaiSC-89-9bac8bcf.woff2",
 "library/fonts/MoUKaiSC-90-b164d5f6.woff2",
 "library/fonts/MoUKaiTC-00-cc90b6e9.woff2",
 "library/fonts/MoUKaiTC-01-969bf7f1.woff2",
 "library/fonts/MoUKaiTC-02-c14b62b4.woff2",
 "library/fonts/MoUKaiTC-03-aa410270.woff2",
 "library/fonts/MoUKaiTC-04-a075176b.woff2",
 "library/fonts/MoUKaiTC-05-4adbfcc3.woff2",
 "library/fonts/MoUKaiTC-06-fcba0613.woff2",
 "library/fonts/MoUKaiTC-07-7b85017c.woff2",
 "library/fonts/MoUKaiTC-08-9bce6f41.woff2",
 "library/fonts/MoUKaiTC-09-adc05d0e.woff2",
 "library/fonts/MoUKaiTC-10-5fae1feb.woff2",
 "library/fonts/MoUKaiTC-11-1bb13501.woff2",
 "library/fonts/MoUKaiTC-12-699ae22f.woff2",
 "library/fonts/MoUKaiTC-13-2c4f9315.woff2",
 "library/fonts/MoUKaiTC-14-f2264299.woff2",
 "library/fonts/MoUKaiTC-15-8ba22537.woff2",
 "library/fonts/MoUKaiTC-16-cde4ccaf.woff2",
 "library/fonts/MoUKaiTC-17-11f26361.woff2",
 "library/fonts/MoUKaiTC-18-e00758fe.woff2",
 "library/fonts/MoUKaiTC-19-b0bfcdcf.woff2",
 "library/fonts/MoUKaiTC-20-7f006de5.woff2",
 "library/fonts/MoUKaiTC-21-355423ba.woff2",
 "library/fonts/MoUKaiTC-22-d31a49b2.woff2",
 "library/fonts/MoUKaiTC-23-55e64208.woff2",
 "library/fonts/MoUKaiTC-24-e2321f78.woff2",
 "library/fonts/MoUKaiTC-25-771b4e7d.woff2",
 "library/fonts/MoUKaiTC-26-036ca99b.woff2",
 "library/fonts/MoUKaiTC-27-8652df5c.woff2",
 "library/fonts/MoUKaiTC-28-bee27dc3.woff2",
 "library/fonts/MoUKaiTC-29-f5c6384a.woff2",
 "library/fonts/MoUKaiTC-30-d8f74ea8.woff2",
 "library/fonts/MoUKaiTC-31-ecd853af.woff2",
 "library/fonts/MoUKaiTC-32-b4e78925.woff2",
 "library/fonts/MoUKaiTC-33-c4e43f6c.woff2",
 "library/fonts/MoUKaiTC-34-22c1f119.woff2",
 "library/fonts/MoUKaiTC-35-d46b964d.woff2",
 "library/fonts/MoUKaiTC-36-48a93521.woff2",
 "library/fonts/MoUKaiTC-37-c1e0a7e7.woff2",
 "library/fonts/MoUKaiTC-38-e649f12a.woff2",
 "library/fonts/MoUKaiTC-39-f1812a9e.woff2",
 "library/fonts/MoUKaiTC-40-239dc519.woff2",
 "library/fonts/MoUKaiTC-41-14ad4649.woff2",
 "library/fonts/MoUKaiTC-42-190fc0a4.woff2",
 "library/fonts/MoUKaiTC-43-20d8b671.woff2",
 "library/fonts/MoUKaiTC-44-669f71c1.woff2",
 "library/fonts/MoUKaiTC-45-72445ca6.woff2",
 "library/fonts/MoUKaiTC-46-c20ed2e7.woff2",
 "library/fonts/MoUKaiTC-47-deee78b2.woff2",
 "library/fonts/MoUKaiTC-48-760635c2.woff2",
 "library/fonts/MoUKaiTC-49-b9eb530b.woff2",
 "library/fonts/MoUKaiTC-50-7be0ddb1.woff2",
 "library/fonts/MoUKaiTC-51-b8297f53.woff2",
 "library/fonts/MoUKaiTC-52-459594c3.woff2",
 "library/fonts/MoUKaiTC-53-5e9dbc06.woff2",
 "library/fonts/MoUKaiTC-54-c30ffdfc.woff2",
 "library/fonts/MoUKaiTC-55-ddc6266e.woff2",
 "library/fonts/MoUKaiTC-56-9779d432.woff2",
 "library/fonts/MoUKaiTC-57-ac1b18e9.woff2",
 "library/fonts/MoUKaiTC-58-fe7ce43a.woff2",
 "library/fonts/MoUKaiTC-59-3d078583.woff2",
 "library/fonts/MoUKaiTC-60-eacb95a1.woff2",
 "library/fonts/MoUKaiTC-61-7a7789ec.woff2",
 "library/fonts/MoUKaiTC-62-7ac5caad.woff2",
 "library/fonts/MoUKaiTC-63-675eb0ac.woff2",
 "library/fonts/MoUKaiTC-64-6b3a6ec8.woff2",
 "library/fonts/MoUKaiTC-65-8f23a7e6.woff2",
 "library/fonts/MoUKaiTC-66-e13e32f1.woff2",
 "library/fonts/MoUKaiTC-67-eb093d70.woff2",
 "library/fonts/MoUKaiTC-68-18003cc0.woff2",
 "library/fonts/MoUKaiTC-69-82bf41df.woff2",
 "library/fonts/MoUKaiTC-70-cb52efd6.woff2",
 "library/fonts/MoUKaiTC-71-4c2fba86.woff2",
 "library/fonts/MoUKaiTC-72-5ca3bd14.woff2",
 "library/fonts/MoUKaiTC-73-686dd8c8.woff2",
 "library/fonts/MoUKaiTC-74-4c326985.woff2",
 "library/fonts/MoUKaiTC-75-f791a264.woff2",
 "library/fonts/MoUKaiTC-76-d21d8e10.woff2",
 "library/fonts/MoUKaiTC-77-da680c48.woff2",
 "library/fonts/MoUKaiTC-78-1039734c.woff2",
 "library/fonts/MoUKaiTC-79-e7a90326.woff2",
 "library/fonts/MoUKaiTC-80-2a7848fa.woff2",
 "library/fonts/MoUKaiTC-81-14d08469.woff2",
 "library/fonts/MoUKaiTC-82-c50dc74d.woff2",
 "library/fonts/MoUKaiTC-83-934e999a.woff2",
 "library/fonts/MoUKaiTC-84-6161182a.woff2",
 "library/fonts/MoUKaiTC-85-5e90a585.woff2",
 "library/fonts/MoUKaiTC-86-1c486593.woff2",
 "library/fonts/MoUKaiTC-87-4199307c.woff2",
 "library/fonts/MoUKaiTC-88-21337897.woff2",
 "library/fonts/MoUKaiTC-89-3a5004e4.woff2",
 "library/fonts/MoUKaiTC-90-9ac4029d.woff2"
];
var SCOPE = self.registration.scope;
var SKIP = ['download/', 'apk-www/', 'android/', '.github/'].map(function (p) { return new URL(p, SCOPE).pathname; });
var LIB = new URL('library/', SCOPE).pathname;
var FONT_DIR = LIB + 'fonts/';

function skipped(url) {
  if (url.origin !== self.location.origin) return true;
  for (var i = 0; i < SKIP.length; i++) if (url.pathname.indexOf(SKIP[i]) === 0) return true;
  if (/\.apk$/i.test(url.pathname)) return true;
  return false;
}
function isFontChunk(url) { return url.pathname.indexOf(FONT_DIR) === 0 && /\.woff2$/.test(url.pathname); }
function isLibraryData(url) {
  return url.pathname === LIB + 'index.json' || url.pathname.indexOf(LIB + 'texts/') === 0 || url.pathname === FONT_DIR + 'fonts.json';
}

self.addEventListener('install', function (e) {
  function add(cache, f) {
    // bypass the HTTP cache so a fresh deploy never caches stale files; one failing file does not block the install
    return cache.add(new Request(f, { cache: 'reload' })).catch(function () { return null; });
  }
  e.waitUntil(Promise.all([
    caches.open(CACHE).then(function (c) { return Promise.all(FILES.map(function (f) { return add(c, f); })); }),
    caches.open(DATA).then(function (c) { return Promise.all(CORE.map(function (f) { return add(c, f); })); })
  ]).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  var keep = FONTS.map(function (f) { return new URL(f, SCOPE).pathname; });
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k.indexOf('moxie-') === 0 && k !== CACHE && k !== DATA; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () {
      // font chunks of older builds (their names carry a content hash) are dropped from the data cache
      return caches.open(DATA).then(function (c) {
        return c.keys().then(function (reqs) {
          return Promise.all(reqs.filter(function (r) { var u = new URL(r.url); return isFontChunk(u) && keep.indexOf(u.pathname) < 0; })
            .map(function (r) { return c.delete(r); }));
        });
      });
    }).then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (skipped(url)) return;           // network as usual
  if (isFontChunk(url)) {
    e.respondWith(caches.open(DATA).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
          return res;
        });
      });
    }));
    return;
  }
  if (isLibraryData(url)) {
    // stale-while-revalidate
    e.respondWith(caches.open(DATA).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
          return res;
        });
        if (hit) { e.waitUntil(net.catch(function () { return null; })); return hit; }
        return net;
      });
    }));
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
          return res;
        });
      });
    })
  );
});
