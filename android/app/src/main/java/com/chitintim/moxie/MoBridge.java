package com.chitintim.moxie;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * JavaScript bridge exposed to the page as window.MoBridge.
 * NOTE: @JavascriptInterface methods are called on a background "JavaBridge" thread.
 */
public class MoBridge {

    static final String FOLDER = "墨";

    private final MainActivity activity;
    private final Updater updater;

    MoBridge(MainActivity activity) {
        this.activity = activity;
        this.updater = new Updater(activity);
    }

    void shutdown() {
        updater.shutdown();
    }

    @JavascriptInterface
    public boolean isNative() {
        return true;
    }

    /** "versionName+versionCode", e.g. "1.2.3+10203". versionName is the release tag without the "v"; versionCode = major*10000+minor*100+patch. */
    @JavascriptInterface
    public String version() {
        return versionName() + "+" + versionCode();
    }

    /** The release version, e.g. "1.2.3" ("0.0.0" if unknown). */
    @JavascriptInterface
    public String versionName() {
        try {
            PackageInfo pi = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return pi.versionName == null ? "0.0.0" : pi.versionName;
        } catch (Exception e) {
            return "0.0.0";
        }
    }

    @JavascriptInterface
    @SuppressWarnings("deprecation")
    public int versionCode() {
        try {
            PackageInfo pi = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            return (int) code;
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * Downloads the release APK at {@code url} (must be under https://github.com/chitintim/chinese-handwriting-app/) and opens the package
     * installer when done. Returns "started", "permission" (the "install unknown apps" setting was opened: the user must allow it and
     * tap 更新 again) or "error:&lt;message&gt;". Progress arrives as the window event {@code mo-update}.
     */
    @JavascriptInterface
    public String downloadAndInstall(String url) {
        return updater.start(url);
    }

    @JavascriptInterface
    public void keepScreenOn(boolean on) {
        activity.setKeepScreenOn(on);
    }

    /** Same as saveFile but also shows a toast with the result (used by the blob download fallback). */
    @JavascriptInterface
    public void saveFileAndToast(String filename, String base64Data, String mimeType) {
        final String msg = saveFile(filename, base64Data, mimeType);
        activity.runOnUiThread(() -> Toast.makeText(activity, msg, Toast.LENGTH_LONG).show());
    }

    /**
     * Saves base64 data to public Download/墨/&lt;filename&gt;.
     * @return human-readable status (success or error), never throws.
     */
    @JavascriptInterface
    public String saveFile(String filename, String base64Data, String mimeType) {
        try {
            String name = sanitize(filename);
            String mime = (mimeType == null || mimeType.trim().isEmpty()) ? guessMime(name) : mimeType.trim();
            String b64 = base64Data == null ? "" : base64Data;
            int comma = b64.indexOf(',');
            if (b64.startsWith("data:") && comma >= 0) b64 = b64.substring(comma + 1);
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);

            if (Build.VERSION.SDK_INT >= 29) {
                String saved = saveViaMediaStore(name, mime, bytes);
                return "已儲存到 Download/" + FOLDER + "/" + saved;
            }
            return saveLegacy(name, bytes);
        } catch (Throwable t) {
            String m = t.getMessage();
            return "儲存失敗：" + (m == null ? t.getClass().getSimpleName() : m);
        }
    }

    // ---------------------------------------------------------------- big files, piece by piece
    // The export can be a PNG of 100 MB and more: one base64 string of it would not fit through the JavascriptInterface. The page calls
    // beginFile -> writeChunk (base64 of 1.5 MB raw, any number of times) -> endFile; abortFile drops the half-written file. One file at a time:
    // beginFile throws away an unfinished earlier one (the page was reloaded in between).

    private final Object sinkLock = new Object();
    private Sink sink;
    private int sinkCounter = 0;

    private static class Sink {
        String id;
        String name;
        Uri uri;
        File file;
        OutputStream os;
        ContentResolver cr;
    }

    /** @return "id:N" to use with writeChunk / endFile, or a final status (error, or the storage permission is missing). */
    @JavascriptInterface
    public String beginFile(String filename, String mimeType) {
        synchronized (sinkLock) {
            dropSink();
            try {
                String name = sanitize(filename);
                String mime = (mimeType == null || mimeType.trim().isEmpty()) ? guessMime(name) : mimeType.trim();
                Sink s = new Sink();
                if (Build.VERSION.SDK_INT >= 29) {
                    s.cr = activity.getContentResolver();
                    s.uri = newDownload(s.cr, name, mime);
                    try {
                        s.os = s.cr.openOutputStream(s.uri);
                        if (s.os == null) throw new Exception("無法寫入檔案");
                    } catch (Exception e) {
                        try {
                            s.cr.delete(s.uri, null, null);
                        } catch (Exception ignored) {
                        }
                        throw e;
                    }
                    s.name = name;
                } else {
                    if (activity.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                            != PackageManager.PERMISSION_GRANTED) {
                        activity.runOnUiThread(() -> activity.requestPermissions(
                                new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, MainActivity.REQ_STORAGE));
                        return "需要儲存權限：請在彈出視窗按「允許」，然後再按一次匯出";
                    }
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER);
                    if (!dir.isDirectory() && !dir.mkdirs() && !dir.isDirectory()) {
                        throw new Exception("無法建立資料夾 Download/" + FOLDER);
                    }
                    s.file = uniqueFile(dir, name);
                    s.os = new FileOutputStream(s.file);
                    s.name = s.file.getName();
                }
                s.id = "id:" + (++sinkCounter);
                sink = s;
                return s.id;
            } catch (Throwable t) {
                String m = t.getMessage();
                return "儲存失敗：" + (m == null ? t.getClass().getSimpleName() : m);
            }
        }
    }

    /** @return "ok", or an error text (the half-written file has been dropped). */
    @JavascriptInterface
    public String writeChunk(String id, String base64Data) {
        synchronized (sinkLock) {
            if (sink == null || id == null || !id.equals(sink.id)) return "儲存失敗：找不到這個檔案";
            try {
                byte[] bytes = Base64.decode(base64Data == null ? "" : base64Data, Base64.DEFAULT);
                sink.os.write(bytes);
                return "ok";
            } catch (Throwable t) {
                dropSink();
                String m = t.getMessage();
                return "儲存失敗：" + (m == null ? t.getClass().getSimpleName() : m);
            }
        }
    }

    /** Finishes the file; same status text as saveFile. */
    @JavascriptInterface
    public String endFile(String id) {
        synchronized (sinkLock) {
            if (sink == null || id == null || !id.equals(sink.id)) return "儲存失敗：找不到這個檔案";
            Sink s = sink;
            sink = null;
            try {
                s.os.flush();
                s.os.close();
                if (s.uri != null) {
                    ContentValues done = new ContentValues();
                    done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    s.cr.update(s.uri, done, null, null);
                    return "已儲存到 Download/" + FOLDER + "/" + finalName(s.cr, s.uri, s.name);
                }
                MediaScannerConnection.scanFile(activity, new String[]{s.file.getAbsolutePath()}, null, null);
                return "已儲存到 Download/" + FOLDER + "/" + s.name;
            } catch (Throwable t) {
                discard(s);
                String m = t.getMessage();
                return "儲存失敗：" + (m == null ? t.getClass().getSimpleName() : m);
            }
        }
    }

    @JavascriptInterface
    public void abortFile(String id) {
        synchronized (sinkLock) {
            if (sink != null && id != null && id.equals(sink.id)) dropSink();
        }
    }

    private void dropSink() {
        if (sink == null) return;
        Sink s = sink;
        sink = null;
        discard(s);
    }

    private void discard(Sink s) {
        try {
            if (s.os != null) s.os.close();
        } catch (Exception ignored) {
        }
        try {
            if (s.uri != null) s.cr.delete(s.uri, null, null);
            else if (s.file != null) s.file.delete();
        } catch (Exception ignored) {
        }
    }

    // ---------------------------------------------------------------- API 29+

    private Uri newDownload(ContentResolver cr, String name, String mime) throws Exception {
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
        v.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (uri == null) throw new Exception("無法建立檔案");
        return uri;
    }

    /** The provider may have renamed the file ("name (1).png"); returns the real name. */
    private static String finalName(ContentResolver cr, Uri uri, String name) {
        String finalName = name;
        Cursor c = null;
        try {
            c = cr.query(uri, new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null);
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && !n.isEmpty()) finalName = n;
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.close();
        }
        return finalName;
    }

    private String saveViaMediaStore(String name, String mime, byte[] bytes) throws Exception {
        ContentResolver cr = activity.getContentResolver();
        Uri uri = newDownload(cr, name, mime);
        try {
            OutputStream os = cr.openOutputStream(uri);
            if (os == null) throw new Exception("無法寫入檔案");
            try {
                os.write(bytes);
                os.flush();
            } finally {
                os.close();
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(uri, done, null, null);
        } catch (Exception e) {
            try {
                cr.delete(uri, null, null);
            } catch (Exception ignored) {
            }
            throw e;
        }
        return finalName(cr, uri, name);
    }

    // ---------------------------------------------------------------- API 24-28

    private String saveLegacy(String name, byte[] bytes) throws Exception {
        if (activity.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            activity.runOnUiThread(() -> activity.requestPermissions(
                    new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, MainActivity.REQ_STORAGE));
            return "需要儲存權限：請在彈出視窗按「允許」，然後再按一次匯出";
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER);
        if (!dir.isDirectory() && !dir.mkdirs() && !dir.isDirectory()) {
            throw new Exception("無法建立資料夾 Download/" + FOLDER);
        }
        File f = uniqueFile(dir, name);
        FileOutputStream os = new FileOutputStream(f);
        try {
            os.write(bytes);
            os.flush();
        } finally {
            os.close();
        }
        MediaScannerConnection.scanFile(activity, new String[]{f.getAbsolutePath()}, null, null);
        return "已儲存到 Download/" + FOLDER + "/" + f.getName();
    }

    private static File uniqueFile(File dir, String name) {
        File f = new File(dir, name);
        if (!f.exists()) return f;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 1; i < 1000; i++) {
            f = new File(dir, base + " (" + i + ")" + ext);
            if (!f.exists()) return f;
        }
        return new File(dir, base + "-" + System.currentTimeMillis() + ext);
    }

    // ---------------------------------------------------------------- helpers

    private static String sanitize(String filename) {
        String n = filename == null ? "" : filename;
        int slash = Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\'));
        if (slash >= 0) n = n.substring(slash + 1);
        n = n.replaceAll("[\\p{Cntrl}:*?\"<>|]", "_").trim();
        while (n.startsWith(".")) n = n.substring(1);
        if (n.isEmpty()) n = "moxie-" + System.currentTimeMillis();
        if (n.length() > 120) {
            int dot = n.lastIndexOf('.');
            String ext = (dot > 0 && n.length() - dot <= 10) ? n.substring(dot) : "";
            n = n.substring(0, 120 - ext.length()) + ext;
        }
        return n;
    }

    private static String guessMime(String name) {
        int dot = name.lastIndexOf('.');
        if (dot >= 0) {
            String ext = name.substring(dot + 1).toLowerCase(Locale.ROOT);
            String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if (m != null) return m;
        }
        return "application/octet-stream";
    }
}
