package dev.bladedeck.app;

import android.app.Activity;
import android.os.Bundle;
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
   remembers them, then shows the one you pick full screen. */
public class MainActivity extends Activity {
  private WebView web;
  private static final String HOME = "file:///android_asset/connect.html";

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
    web.setWebChromeClient(new WebChromeClient());
    web.setWebViewClient(new WebViewClient() {
      // Bladedeck went away (PC asleep, Wi-Fi changed): back to the connect screen.
      @Override public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
        if (req.isForMainFrame() && !req.getUrl().toString().startsWith("file:")) v.loadUrl(HOME + "#lost");
      }
    });
    web.addJavascriptInterface(new Bridge(), "BladedeckApp");
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    setContentView(web);
    if (saved != null) web.restoreState(saved); else web.loadUrl(HOME);
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
  }
}
