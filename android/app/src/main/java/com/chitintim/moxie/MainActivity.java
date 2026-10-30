package com.chitintim.moxie;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.AndroidRuntimeException;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Single-activity WebView shell for the offline 墨 handwriting web app.
 * The web app lives in assets/www and is served at https://appassets.androidplatform.net/.
 */
public class MainActivity extends Activity {

    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/index.html";
    static final int REQ_STORAGE = 4201;

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private MoBridge bridge;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean backPending = false;

    // crash-loop guard for onRenderProcessGone
    private static int crashCount = 0;
    private static long crashWindowStart = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setBackgroundDrawableResource(R.color.white);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }

        try {
            assetLoader = new WebViewAssetLoader.Builder()
                    .setDomain(HOST)
                    .addPathHandler("/", new WwwPathHandler(this))
                    .build();
            webView = createWebView();
        } catch (AndroidRuntimeException | LinkageError e) {
            // No usable WebView implementation installed / enabled on this device.
            showFatal("無法啟動 WebView (Android System WebView 未安裝或已停用)。\n\n" + e.getMessage());
            return;
        }
        setContentView(webView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        applyImmersive();

        View decor = w.getDecorView();
        decor.setOnSystemUiVisibilityChangeListener(visibility -> handler.postDelayed(this::applyImmersive, 300));

        webView.loadUrl(START_URL);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface", "ClickableViewAccessibility"})
    private WebView createWebView() {
        final WebView wv = new WebView(this);
        wv.setBackgroundColor(Color.WHITE);
        wv.setOverScrollMode(View.OVER_SCROLL_NEVER);
        wv.setVerticalScrollBarEnabled(false);
        wv.setHorizontalScrollBarEnabled(false);
        wv.setScrollbarFadingEnabled(false);
        wv.setHapticFeedbackEnabled(false);
        wv.setLongClickable(false);
        wv.setOnLongClickListener(v -> true); // swallow long-press (selection / context menus)
        wv.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // localStorage + IndexedDB
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        bridge = new MoBridge(this);
        wv.addJavascriptInterface(bridge, "MoBridge");

        wv.setWebViewClient(new AppClient());
        wv.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                handleDownload(url, contentDisposition, mimeType));
        return wv;
    }

    // ------------------------------------------------------------------ WebViewClient

    private class AppClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!HOST.equalsIgnoreCase(uri.getHost())) {
                return null; // not ours (no INTERNET permission anyway)
            }
            String path = uri.getPath();
            // The app is fully bundled; a service worker would only risk serving stale code after an
            // APK update (and its network fetches are not routed through the asset loader).
            if (path != null && path.endsWith("/sw.js")) {
                return notFound();
            }
            WebResourceResponse r = assetLoader.shouldInterceptRequest(uri);
            return r != null ? r : notFound();
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !handleNavigation(request.getUrl());
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            handleRendererGone(view);
            return true;
        }
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                new HashMap<String, String>(),
                new ByteArrayInputStream(new byte[0]));
    }

    /** @return true if the WebView should load this URL itself. */
    private boolean handleNavigation(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (scheme.equals("about") || scheme.equals("blob") || scheme.equals("data") || scheme.equals("javascript")) {
            return true;
        }
        if (scheme.equals("https") && HOST.equalsIgnoreCase(uri.getHost())) {
            return true;
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (ActivityNotFoundException | SecurityException e) {
            Toast.makeText(this, "無法開啟連結", Toast.LENGTH_SHORT).show();
        }
        return false;
    }

    /** Best effort for &lt;a download href="blob:..."&gt; style exports from the page. */
    private void handleDownload(String url, String contentDisposition, String mimeType) {
        if (webView == null || url == null) return;
        if (!url.startsWith("blob:") && !url.startsWith("data:")) {
            Toast.makeText(this, "不支援的下載", Toast.LENGTH_SHORT).show();
            return;
        }
        String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
        String mime = (mimeType == null || mimeType.isEmpty()) ? "application/octet-stream" : mimeType;
        String js = "(function(){try{var x=new XMLHttpRequest();x.open('GET'," + JSONObject.quote(url)
                + ",true);x.responseType='blob';x.onload=function(){var r=new FileReader();"
                + "r.onloadend=function(){var d=String(r.result).split(',')[1]||'';"
                + "MoBridge.saveFileAndToast(" + JSONObject.quote(name) + ",d," + JSONObject.quote(mime) + ");};"
                + "r.readAsDataURL(x.response);};x.send();}catch(e){}})();";
        webView.evaluateJavascript(js, null);
    }

    // ------------------------------------------------------------------ renderer crash

    private void handleRendererGone(WebView view) {
        long now = System.currentTimeMillis();
        if (now - crashWindowStart > 30_000) {
            crashWindowStart = now;
            crashCount = 0;
        }
        crashCount++;
        if (view != null) {
            try {
                ViewGroup p = (ViewGroup) view.getParent();
                if (p != null) p.removeView(view);
                view.removeJavascriptInterface("MoBridge");
                view.destroy();
            } catch (RuntimeException ignored) {
            }
        }
        webView = null;
        if (crashCount > 3) {
            showFatal("WebView 渲染程序反覆當機，請重新啟動 App。");
            return;
        }
        handler.post(this::recreate);
    }

    private void showFatal(String message) {
        TextView tv = new TextView(this);
        tv.setText(message);
        tv.setTextColor(Color.BLACK);
        tv.setBackgroundColor(Color.WHITE);
        tv.setTextSize(22);
        tv.setGravity(Gravity.CENTER);
        tv.setPadding(48, 48, 48, 48);
        setContentView(tv);
    }

    // ------------------------------------------------------------------ immersive

    @SuppressWarnings("deprecation")
    private void applyImmersive() {
        Window w = getWindow();
        if (w == null) return;
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersive();
    }

    void setKeepScreenOn(boolean on) {
        runOnUiThread(() -> {
            if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    // ------------------------------------------------------------------ keys / back

    private static String keyDirection(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_VOLUME_DOWN:
            case KeyEvent.KEYCODE_PAGE_DOWN:
            case KeyEvent.KEYCODE_NAVIGATE_NEXT:
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                return "next";
            case KeyEvent.KEYCODE_VOLUME_UP:
            case KeyEvent.KEYCODE_PAGE_UP:
            case KeyEvent.KEYCODE_NAVIGATE_PREVIOUS:
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                return "prev";
            default:
                return null;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String dir = keyDirection(event.getKeyCode());
        if (dir != null) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0 && webView != null) {
                webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('mo-key',{detail:'" + dir + "'}));", null);
            }
            return true; // consume DOWN, repeats and UP: no volume change, no double delivery to the page
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            finish();
            return;
        }
        // The page owns Back (it closes dialogs and steps back through its own screens and returns true);
        // when it reports false (home screen) the app closes. Never use WebView history here: the page's
        // hash history can contain the home screen in the middle, which would trap the user.
        if (backPending) { // second press while waiting for JS: just leave
            finish();
            return;
        }
        backPending = true;
        final boolean[] answered = {false};
        final Runnable timeout = () -> {
            if (!answered[0]) {
                answered[0] = true;
                backPending = false;
                finish();
            }
        };
        handler.postDelayed(timeout, 1000);
        String js = "(function(){try{var e=new CustomEvent('mo-back',{cancelable:true});"
                + "window.dispatchEvent(e);if(e.defaultPrevented){return true;}"
                + "if(typeof window.__moHandleBack==='function'){return window.__moHandleBack()===true;}"
                + "return false;}catch(x){return false;}})()";
        webView.evaluateJavascript(js, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (answered[0]) return;
                answered[0] = true;
                handler.removeCallbacks(timeout);
                backPending = false;
                if (!"true".equals(value)) finish();
            }
        });
    }

    // ------------------------------------------------------------------ lifecycle

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_STORAGE) {
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            Toast.makeText(this, ok ? "已允許儲存權限，請再按一次匯出" : "未允許儲存權限，無法匯出", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        applyImmersive();
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            // let the page persist unsaved ink now: the process may be killed while we are in the background
            webView.evaluateJavascript("window.dispatchEvent(new Event('mo-pause'));", null);
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (webView != null) {
            try {
                ViewGroup p = (ViewGroup) webView.getParent();
                if (p != null) p.removeView(webView);
                webView.removeJavascriptInterface("MoBridge");
                webView.destroy();
            } catch (RuntimeException ignored) {
            }
            webView = null;
        }
        super.onDestroy();
    }

    // ------------------------------------------------------------------ asset serving

    /** Serves assets/www/** with correct MIME types (the stock AssetsPathHandler mis-guesses woff2/mjs/webmanifest). */
    static final class WwwPathHandler implements WebViewAssetLoader.PathHandler {
        private final android.content.Context ctx;
        private static final Map<String, String> MIME = new HashMap<>();

        static {
            MIME.put("html", "text/html");
            MIME.put("htm", "text/html");
            MIME.put("js", "text/javascript");
            MIME.put("mjs", "text/javascript");
            MIME.put("css", "text/css");
            MIME.put("json", "application/json");
            MIME.put("map", "application/json");
            MIME.put("webmanifest", "application/manifest+json");
            MIME.put("txt", "text/plain");
            MIME.put("svg", "image/svg+xml");
            MIME.put("png", "image/png");
            MIME.put("jpg", "image/jpeg");
            MIME.put("jpeg", "image/jpeg");
            MIME.put("gif", "image/gif");
            MIME.put("webp", "image/webp");
            MIME.put("ico", "image/x-icon");
            MIME.put("woff2", "font/woff2");
            MIME.put("woff", "font/woff");
            MIME.put("ttf", "font/ttf");
            MIME.put("otf", "font/otf");
            MIME.put("wasm", "application/wasm");
        }

        WwwPathHandler(android.content.Context ctx) {
            this.ctx = ctx.getApplicationContext();
        }

        @Override
        public WebResourceResponse handle(String path) {
            if (path == null) return null;
            if (path.isEmpty() || path.endsWith("/")) path = path + "index.html";
            if (path.startsWith("/")) path = path.substring(1);
            if (path.contains("..")) return null;
            try {
                InputStream in = ctx.getAssets().open("www/" + path);
                int dot = path.lastIndexOf('.');
                String ext = dot >= 0 ? path.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
                String mime = MIME.get(ext);
                if (mime == null) mime = "application/octet-stream";
                boolean text = mime.startsWith("text/") || mime.equals("application/json")
                        || mime.equals("application/manifest+json") || mime.equals("image/svg+xml");
                return new WebResourceResponse(mime, text ? "utf-8" : null, in);
            } catch (IOException e) {
                return null;
            }
        }
    }
}
