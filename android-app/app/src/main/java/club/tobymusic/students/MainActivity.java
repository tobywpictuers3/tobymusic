package club.tobymusic.students;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;

public final class MainActivity extends Activity {
    private static final String START_URL = "https://students.tobymusic.club/";
    private static final String TRUSTED_HOST = "students.tobymusic.club";
    private static final int PICK_UPLOAD = 1101;
    private static final int SAVE_EXPORT = 1102;
    private static final int RECORD_AUDIO_REQUEST = 1103;
    private static final int MAX_BLOB_BYTES = 48 * 1024 * 1024;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingAudioRequest;
    private byte[] pendingExport;
    private volatile boolean onTrustedPage = false;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(15, 15, 18));
        getWindow().setNavigationBarColor(Color.rgb(15, 15, 18));
        getWindow().getDecorView().setSystemUiVisibility(0);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(15, 15, 18));
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(true);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(true);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.addJavascriptInterface(new LocalExportBridge(), "TobyLocalExport");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                onTrustedPage = isTrusted(Uri.parse(url));
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                if (isTrusted(target)) return false;
                String scheme = target.getScheme();
                if ("https".equalsIgnoreCase(scheme) || "mailto".equalsIgnoreCase(scheme) ||
                        "tel".equalsIgnoreCase(scheme)) {
                    openExternal(target);
                }
                return true;
            }
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    runOnUiThread(() -> new AlertDialog.Builder(MainActivity.this)
                        .setMessage("לא ניתן להתחבר למערכת. בדקי את החיבור לאינטרנט ונסי שוב.")
                        .setPositiveButton("נסי שוב", (d, w) -> webView.reload())
                        .setNegativeButton("סגירה", (d, w) -> d.dismiss())
                        .show());
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                String[] accept = params.getAcceptTypes();
                if (accept != null && accept.length > 0) {
                    java.util.ArrayList<String> filtered = new java.util.ArrayList<>();
                    for (String v : accept) {
                        if (v != null && v.contains("/") && !v.contains(",")) filtered.add(v);
                    }
                    if (!filtered.isEmpty()) {
                        intent.putExtra(Intent.EXTRA_MIME_TYPES, filtered.toArray(new String[0]));
                    }
                }
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
                    params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(intent, PICK_UPLOAD);
                } catch (Exception ex) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    toast("לא ניתן לפתוח את בורר הקבצים");
                }
                return true;
            }
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!onTrustedPage || !isTrusted(request.getOrigin())) {
                        request.deny();
                        return;
                    }
                    String[] permissions = request.getResources();
                    if (permissions.length != 1 ||
                        !PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(permissions[0])) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                        == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        pendingAudioRequest = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},
                            RECORD_AUDIO_REQUEST);
                    }
                });
            }
            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (request == pendingAudioRequest) pendingAudioRequest = null;
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String disposition,
                                        String mimeType, long size) {
                if (url.startsWith("blob:")) {
                    exportBlob(url, URLUtil.guessFileName("https://students.tobymusic.club/file",
                        disposition, mimeType), mimeType);
                } else {
                    downloadHttps(url, userAgent, disposition, mimeType);
                }
            }
        });

        if (state != null) webView.restoreState(state);
        else webView.loadUrl(START_URL);
    }

    private boolean isTrusted(Uri u) {
        return u != null && "https".equalsIgnoreCase(u.getScheme()) &&
            TRUSTED_HOST.equalsIgnoreCase(u.getHost()) &&
            (u.getPort() == -1 || u.getPort() == 443);
    }

    private void openExternal(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (Exception e) {
            toast("לא נמצא יישום לפתיחת הקישור");
        }
    }

    private void downloadHttps(String url, String ua, String disposition, String mime) {
        Uri u = Uri.parse(url);
        if (!"https".equalsIgnoreCase(u.getScheme())) {
            toast("ההורדה נחסמה: כתובת לא מאובטחת");
            return;
        }
        try {
            String filename = safeName(URLUtil.guessFileName(url, disposition, mime));
            DownloadManager.Request request = new DownloadManager.Request(u);
            request.setTitle(filename);
            request.setMimeType(mime == null ? "application/octet-stream" : mime);
            request.addRequestHeader("User-Agent", ua == null ? "" : ua);
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null && !cookie.isEmpty()) request.addRequestHeader("Cookie", cookie);
            request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
            ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(request);
            toast("ההורדה מתחילה");
        } catch (Exception ex) {
            toast("לא ניתן להוריד את הקובץ");
        }
    }

    private static String safeName(String name) {
        if (name == null || name.isBlank()) return "TOBY-Music-file.pdf";
        String sanitized = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        return sanitized.length() > 120 ? sanitized.substring(0, 120) : sanitized;
    }

    private void exportBlob(String url, String suggested, String mime) {
        if (!onTrustedPage || !url.startsWith("blob:" + START_URL.substring(0, START_URL.length() - 1))) {
            toast("לא ניתן להוריד את הקובץ מהמקור הזה");
            return;
        }
        String js = "(async()=>{try{const r=await fetch(" + JSONObject.quote(url) + ");" +
            "const b=await r.blob();if(b.size>" + MAX_BLOB_BYTES + "){throw Error('File too large')}" +
            "TobyLocalExport.start(" + JSONObject.quote(safeName(suggested)) + "," +
            "b.type||" + JSONObject.quote(mime == null ? "application/octet-stream" : mime) +
            ",b.size);" +
            "const a=new Uint8Array(await b.arrayBuffer());for(let i=0;i<a.length;i+=24576){" +
            "let s='';const v=a.subarray(i,Math.min(i+24576,a.length));" +
            "for(let j=0;j<v.length;j++)s+=String.fromCharCode(v[j]);" +
            "TobyLocalExport.chunk(btoa(s));}TobyLocalExport.finish();" +
            "}catch(e){TobyLocalExport.fail();}})();";
        webView.evaluateJavascript(js, null);
    }

    private final class LocalExportBridge {
        private ByteArrayOutputStream data;
        private String name;
        private String mime;
        private boolean rejected;
        @JavascriptInterface
        public synchronized void start(String filename, String contentType, int length) {
            rejected = !onTrustedPage || length < 0 || length > MAX_BLOB_BYTES;
            data = rejected ? null : new ByteArrayOutputStream(Math.min(length, 65536));
            name = safeName(filename);
            mime = contentType == null || contentType.isEmpty() ? "application/octet-stream" : contentType;
        }
        @JavascriptInterface
        public synchronized void chunk(String base64) {
            if (rejected || data == null) return;
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                if (data.size() + bytes.length > MAX_BLOB_BYTES) {
                    rejected = true;
                    data = null;
                    return;
                }
                data.write(bytes, 0, bytes.length);
            } catch (Exception e) {
                rejected = true;
                data = null;
            }
        }
        @JavascriptInterface
        public synchronized void finish() {
            if (rejected || data == null) {
                fail();
                return;
            }
            byte[] bytes = data.toByteArray();
            String fileName = name;
            String contentType = mime;
            data = null;
            runOnUiThread(() -> {
                pendingExport = bytes;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(contentType);
                intent.putExtra(Intent.EXTRA_TITLE, fileName);
                try {
                    startActivityForResult(intent, SAVE_EXPORT);
                } catch (Exception e) {
                    pendingExport = null;
                    toast("לא ניתן לשמור את הקובץ");
                }
            });
        }
        @JavascriptInterface
        public void fail() { runOnUiThread(() -> toast("שמירת הקובץ נכשלה")); }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_UPLOAD && fileCallback != null) {
            Uri[] selected = null;
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    selected = new Uri[count];
                    for (int i = 0; i < count; i++)
                        selected[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    selected = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(selected);
            fileCallback = null;
        }
        if (request == SAVE_EXPORT) {
            byte[] bytes = pendingExport;
            pendingExport = null;
            if (result == RESULT_OK && data != null && data.getData() != null && bytes != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    if (out == null) throw new Exception("No output stream");
                    out.write(bytes);
                    toast("הקובץ נשמר");
                } catch (Exception ex) {
                    toast("שמירת הקובץ נכשלה");
                }
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants);
        if (code == RECORD_AUDIO_REQUEST && pendingAudioRequest != null) {
            PermissionRequest request = pendingAudioRequest;
            pendingAudioRequest = null;
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED &&
                onTrustedPage && isTrusted(request.getOrigin())) {
                request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                request.deny();
            }
        }
    }

    private void toast(String text) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_LONG).show());
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle bundle) {
        webView.saveState(bundle);
        super.onSaveInstanceState(bundle);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("TobyLocalExport");
            webView.destroy();
        }
        super.onDestroy();
    }
}
