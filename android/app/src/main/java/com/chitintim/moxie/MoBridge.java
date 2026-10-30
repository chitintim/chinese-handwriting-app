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

    MoBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean isNative() {
        return true;
    }

    @JavascriptInterface
    public String version() {
        try {
            PackageInfo pi = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            return pi.versionName + "+" + code;
        } catch (Exception e) {
            return "unknown";
        }
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

    // ---------------------------------------------------------------- API 29+

    private String saveViaMediaStore(String name, String mime, byte[] bytes) throws Exception {
        ContentResolver cr = activity.getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
        v.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
        Uri uri = cr.insert(collection, v);
        if (uri == null) throw new Exception("無法建立檔案");
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
        // The provider may have renamed the file ("name (1).png"); report the real name.
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
