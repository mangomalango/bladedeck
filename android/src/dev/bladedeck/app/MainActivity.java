package dev.bladedeck.app;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.DownloadManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;

/* Bladedeck on Android: the phone app that Bladedeck serves, in a window of its own. It starts
   on a small connect screen (assets/connect.html) that finds Bladedecks on the Wi-Fi and
   remembers them, then shows the one you pick full screen.
   It also: rings Bladedeck's timers and alarms as notifications (scheduled on the phone, so they
   go off even with the app closed), lets you pick files to send to the PC, and saves files the
   PC sends into Downloads/Bladedeck. */
public class MainActivity extends Activity {
  private WebView web;
  private static final String HOME = "file:///android_asset/connect.html";
  private ValueCallback<Uri[]> picking;
  private volatile String pageOrigin = "";
  // "http://<host>:47616" for a Bladedeck page, "" for anything else.
  static String originOf(String url) {
    if (url == null) return "";
    Uri u = Uri.parse(url);
    return "http".equals(u.getScheme()) && u.getPort() == 47616 && u.getHost() != null && !u.getHost().isEmpty() ? "http://" + u.getHost() + ":47616" : "";
  }

  @Override protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    web = new WebView(this);
    web.setBackgroundColor(0xff14000a);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(true);
    s.setUserAgentString(s.getUserAgentString() + " BladedeckApp/1");
    web.setWebChromeClient(new WebChromeClient() {
      // "Send to PC": the system's file picker, several files at once.
      @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
        if (picking != null) picking.onReceiveValue(null);
        picking = cb;
        Intent i = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try { startActivityForResult(Intent.createChooser(i, "Send to Bladedeck"), 7); } catch (Exception e) { picking = null; return false; }
        return true;
      }
    });
    // Files from the PC go to Downloads/Bladedeck, with the system's download progress.
    web.setDownloadListener((url, ua, disposition, mime, length) -> {
      try {
        String name = URLUtil.guessFileName(url, disposition, mime);
        DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url)).setMimeType(mime).setTitle(name)
          .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Bladedeck/" + name);
        ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
        Toast.makeText(this, "Saving " + name + " to Downloads/Bladedeck", Toast.LENGTH_SHORT).show();
      } catch (Exception e) { Toast.makeText(this, "That file could not be saved.", Toast.LENGTH_SHORT).show(); }
    });
    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != 0) requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 3);
    web.setWebViewClient(new WebViewClient() {
      // Bladedeck went away (PC asleep, Wi-Fi changed): back to the connect screen.
      @Override public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
        if (req.isForMainFrame() && !req.getUrl().toString().startsWith("file:")) v.loadUrl(HOME + "#lost");
      }
      // The Bladedeck page on screen (scheme, host and Bladedeck's port), for Bridge.link. Set when a
      // page starts and again when it has finished (after any redirect), from the WebView's own URL.
      @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) { pageOrigin = originOf(url); }
      @Override public void onPageFinished(WebView v, String url) { pageOrigin = originOf(v.getUrl()); }
      // Only the connect screen and Bladedeck pages open here (the bridge is in every page this
      // window loads); any other link opens in the phone's browser instead.
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
        String url = req.getUrl().toString();
        if (url.startsWith("file:///android_asset/") || !originOf(url).isEmpty()) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl())); } catch (Exception e) { /* no browser */ }
        return true;
      }
    });
    web.addJavascriptInterface(new Bridge(), "BladedeckApp");
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    setContentView(web);
    if (saved != null) web.restoreState(saved); else web.loadUrl(HOME);
  }

  @Override protected void onActivityResult(int req, int res, Intent data) {
    super.onActivityResult(req, res, data);
    if (req != 7 || picking == null) return;
    Uri[] got = null;
    if (res == RESULT_OK && data != null) {
      if (data.getClipData() != null) { got = new Uri[data.getClipData().getItemCount()]; for (int i = 0; i < got.length; i++) got[i] = data.getClipData().getItemAt(i).getUri(); }
      else if (data.getData() != null) got = new Uri[] { data.getData() };
    }
    picking.onReceiveValue(got); picking = null;
  }

  // Bladedeck's timers and alarms, set as alarms on the phone. The old ones are replaced each time.
  void schedule(String json) {
    AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
    SharedPreferences sp = getSharedPreferences("alarms", MODE_PRIVATE);
    for (String k : sp.getAll().keySet()) am.cancel(pending(Integer.parseInt(k), "", ""));
    SharedPreferences.Editor ed = sp.edit().clear();
    try {
      JSONArray a = new JSONArray(json);
      long now = System.currentTimeMillis();
      for (int i = 0; i < a.length() && i < 20; i++) {
        JSONObject o = a.getJSONObject(i);
        long at = o.optLong("at"); if (at <= now) continue;
        int id = 1000 + i;
        PendingIntent pi = pending(id, "timer".equals(o.optString("kind")) ? "Timer done" : "Alarm", o.optString("label", "Bladedeck"));
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, pi), pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        ed.putBoolean(String.valueOf(id), true);
      }
    } catch (Exception e) { /* bad list: nothing set */ }
    ed.apply();
  }
  PendingIntent pending(int id, String title, String text) {
    Intent i = new Intent(this, AlarmReceiver.class).putExtra("id", id).putExtra("title", title).putExtra("text", text);
    return PendingIntent.getBroadcast(this, id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }

  @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

  @Override public void onBackPressed() {
    if (web.canGoBack()) web.goBack();
    else if (!web.getUrl().startsWith("file:")) web.loadUrl(HOME + "#switch");
    else super.onBackPressed();
  }

  class Bridge {
    // The phone's own network address, so the connect screen knows where to look.
    @JavascriptInterface public String address() {
      try {
        for (NetworkInterface n : Collections.list(NetworkInterface.getNetworkInterfaces())) {
          if (!n.isUp() || n.isLoopback()) continue;
          for (InetAddress a : Collections.list(n.getInetAddresses())) {
            if (a instanceof Inet4Address && a.isSiteLocalAddress()) return a.getHostAddress();
          }
        }
      } catch (Exception e) { /* no network */ }
      return "";
    }
    @JavascriptInterface public void home() { runOnUiThread(() -> web.loadUrl(HOME + "#switch")); }
    // Only Bladedeck pages are ever loaded here; these only make notifications and alarms.
    @JavascriptInterface public void notify(String title, String text) { AlarmReceiver.show(MainActivity.this, 999, String.valueOf(title).substring(0, Math.min(80, String.valueOf(title).length())), String.valueOf(text).substring(0, Math.min(200, String.valueOf(text).length()))); }
    @JavascriptInterface public void schedule(String json) { runOnUiThread(() -> MainActivity.this.schedule(json)); }

    /* Messages to the PC (NotifyService). The page hands over its pairing key; the address is
       the page's own (pageOrigin), never one the page names, so messages can only go to the
       Bladedeck this phone shows. An empty key forgets the link. */
    @JavascriptInterface public void link(String key) {
      String o = pageOrigin, k = key == null ? "" : key.trim();
      SharedPreferences.Editor ed = NotifyService.prefs(MainActivity.this).edit();
      if (k.isEmpty() || o.isEmpty()) ed.remove("base").remove("key"); else ed.putString("base", o).putString("key", k);
      ed.apply();
    }
    @JavascriptInterface public boolean notifyAccess() {
      String on = android.provider.Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
      return on != null && on.contains(getPackageName());
    }
    @JavascriptInterface public void openNotifyAccess() {
      runOnUiThread(() -> { try { startActivity(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")); } catch (Exception e) { /* no such screen */ } });
    }
    // The apps that have posted notifications since access was given, with whether each is ticked.
    @JavascriptInterface public String notifyApps() {
      JSONArray out = new JSONArray();
      SharedPreferences sp = NotifyService.prefs(MainActivity.this);
      try {
        for (java.util.Map.Entry<String, ?> e : sp.getAll().entrySet()) {
          if (!e.getKey().startsWith("seen:")) continue;
          String pkg = e.getKey().substring(5);
          out.put(new JSONObject().put("pkg", pkg).put("name", String.valueOf(e.getValue())).put("on", sp.getBoolean("on:" + pkg, false)));
        }
      } catch (Exception e) { /* empty list */ }
      return out.toString();
    }
    @JavascriptInterface public void setNotifyApp(String pkg, boolean on) {
      if (pkg == null || !pkg.matches("[A-Za-z0-9_.]{1,200}")) return;
      NotifyService.prefs(MainActivity.this).edit().putBoolean("on:" + pkg, on).apply();
    }
  }
}
