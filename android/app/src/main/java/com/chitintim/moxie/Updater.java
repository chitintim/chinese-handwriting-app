package com.chitintim.moxie;

import android.app.DownloadManager;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;

/**
 * In-app update: downloads the release APK with the system DownloadManager (it follows the GitHub redirect), then hands it to the
 * package installer through a FileProvider content URI. Progress is reported to the page as the window event
 * {@code mo-update} with {@code detail: {state, progress, message}}; state is one of
 * downloading | downloaded | installing | permission | error.
 */
final class Updater {

    /** Only our own GitHub releases can be installed through the bridge. */
    static final String URL_PREFIX = "https://github.com/chitintim/chinese-handwriting-app/";
    static final String FILE_NAME = "moxie-update.apk";
    private static final long POLL_MS = 700;

    private final MainActivity activity;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private volatile long downloadId = -1;
    private int lastProgress = -1;

    Updater(MainActivity activity) {
        this.activity = activity;
    }

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            long id = downloadId;
            if (id < 0) return;
            DownloadManager dm = (DownloadManager) activity.getSystemService(android.content.Context.DOWNLOAD_SERVICE);
            Cursor c = null;
            try {
                c = dm == null ? null : dm.query(new DownloadManager.Query().setFilterById(id));
                if (c == null || !c.moveToFirst()) {
                    downloadId = -1;
                    emit("error", 0, "下載已取消");
                    return;
                }
                int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                long got = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    downloadId = -1;
                    emit("downloaded", 100, null);
                    install();
                    return;
                }
                if (status == DownloadManager.STATUS_FAILED) {
                    int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                    downloadId = -1;
                    emit("error", 0, "下載失敗 (" + reason + ")");
                    return;
                }
                int p = total > 0 ? (int) (got * 100L / total) : 0;
                if (p != lastProgress) {
                    lastProgress = p;
                    emit("downloading", p, null);
                }
            } catch (Exception e) {
                downloadId = -1;
                emit("error", 0, String.valueOf(e.getMessage()));
                return;
            } finally {
                if (c != null) c.close();
            }
            ui.postDelayed(this, POLL_MS);
        }
    };

    /**
     * Called from the JavaBridge thread. Returns "started", "permission" (the page must ask the user to allow installs and tap
     * 更新 again) or "error:&lt;message&gt;".
     */
    String start(String url) {
        try {
            if (url == null || !url.startsWith(URL_PREFIX)) return "error:不支援的網址";
            if (!canInstall()) {
                openUnknownSourcesSettings();
                emit("permission", 0, null);
                return "permission";
            }
            if (downloadId >= 0) return "started"; // already downloading: keep reporting
            File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) return "error:沒有可用的儲存空間";
            File f = new File(dir, FILE_NAME);
            if (f.exists() && !f.delete()) return "error:無法清除舊的下載檔";
            DownloadManager dm = (DownloadManager) activity.getSystemService(android.content.Context.DOWNLOAD_SERVICE);
            if (dm == null) return "error:系統沒有下載服務";
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            r.setTitle("墨字帖更新");
            r.setDescription("moxie.apk");
            r.setMimeType("application/vnd.android.package-archive");
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, FILE_NAME);
            lastProgress = -1;
            downloadId = dm.enqueue(r);
            ui.removeCallbacks(poll);
            ui.postDelayed(poll, 300);
            return "started";
        } catch (Throwable t) {
            downloadId = -1;
            return "error:" + t.getMessage();
        }
    }

    void shutdown() {
        ui.removeCallbacksAndMessages(null);
    }

    private boolean canInstall() {
        if (Build.VERSION.SDK_INT < 26) return true; // before Oreo the global "unknown sources" switch applies and the installer asks itself
        return activity.getPackageManager().canRequestPackageInstalls();
    }

    private void openUnknownSourcesSettings() {
        if (Build.VERSION.SDK_INT < 26) return;
        activity.runOnUiThread(() -> {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(i);
            } catch (Exception e) {
                Toast.makeText(activity, "請在系統設定中允許本 App 安裝未知應用程式", Toast.LENGTH_LONG).show();
            }
        });
    }

    private void install() {
        try {
            File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            File f = dir == null ? null : new File(dir, FILE_NAME);
            if (f == null || !f.isFile() || f.length() < 100000L) {
                emit("error", 0, "下載的檔案不完整");
                return;
            }
            PackageInfo pi = activity.getPackageManager().getPackageArchiveInfo(f.getAbsolutePath(), 0);
            if (pi == null || !activity.getPackageName().equals(pi.packageName)) {
                emit("error", 0, "這不是墨字帖的安裝檔");
                return;
            }
            if (!canInstall()) { // the permission may have been revoked meanwhile
                openUnknownSourcesSettings();
                emit("permission", 0, null);
                return;
            }
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            emit("installing", 100, null);
        } catch (Exception e) {
            emit("error", 0, String.valueOf(e.getMessage()));
        }
    }

    /** Dispatches the page event; safe from any thread. */
    private void emit(String state, int progress, String message) {
        String js = "window.dispatchEvent(new CustomEvent('mo-update',{detail:{state:" + JSONObject.quote(state)
                + ",progress:" + progress + ",message:" + JSONObject.quote(message == null ? "" : message) + "}}));";
        activity.evalJs(js);
    }
}
