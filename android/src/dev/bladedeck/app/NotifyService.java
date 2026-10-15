package dev.bladedeck.app;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

/* Messages to the PC: a notification from an app the owner ticked (and only those) goes to the
   paired Bladedeck as a bubble (phonemsg.js on the PC). Android asks the owner once to allow
   notification access. Nothing is sent until an app is ticked; ongoing ones (music, downloads),
   group summaries and Bladedeck's own are skipped. It goes only to the Bladedeck this phone is
   paired with, on the home network or Tailscale, and only the app name, the sender and up to 500
   characters of text. Apps that post notifications are remembered by name so the list can offer
   them; that list stays on the phone. */
public class NotifyService extends NotificationListenerService {
  static final String PREFS = "notify";

  static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, MODE_PRIVATE); }

  @Override public void onNotificationPosted(StatusBarNotification sbn) {
    try {
      Notification n = sbn.getNotification();
      String pkg = sbn.getPackageName();
      if (pkg.equals(getPackageName()) || sbn.isOngoing() || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
      SharedPreferences sp = prefs(this);
      String label = pkg;
      try { PackageManager pm = getPackageManager(); ApplicationInfo ai = pm.getApplicationInfo(pkg, 0); label = String.valueOf(pm.getApplicationLabel(ai)); } catch (Exception e) { /* keep the package name */ }
      // Offered in the list next time, ticked or not.
      sp.edit().putString("seen:" + pkg, label).apply();
      if (!sp.getBoolean("on:" + pkg, false)) return;
      String base = sp.getString("base", ""), key = sp.getString("key", "");
      if (base.isEmpty() || key.isEmpty()) return;
      Bundle x = n.extras;
      CharSequence title = x.getCharSequence(Notification.EXTRA_TITLE);
      CharSequence text = x.getCharSequence(Notification.EXTRA_BIG_TEXT);
      if (text == null) text = x.getCharSequence(Notification.EXTRA_TEXT);
      if (title == null && text == null) return;
      JSONObject body = new JSONObject();
      body.put("app", cut(label, 40));
      body.put("sender", cut(title, 40));
      body.put("text", cut(text, 500));
      String icon = picture(n);
      if (!icon.isEmpty()) body.put("icon", icon);
      final String json = body.toString(), url = base + "/api/notify", auth = "Bearer " + key;
      new Thread(() -> send(url, auth, json)).start();
    } catch (Exception e) { /* never let a notification break the listener */ }
  }

  // The sender's picture (the notification's large icon) as a small PNG, 96 px, or "" without one.
  String picture(Notification n) {
    try {
      android.graphics.drawable.Icon ic = n.getLargeIcon();
      if (ic == null) return "";
      android.graphics.drawable.Drawable d = ic.loadDrawable(this);
      if (d == null) return "";
      android.graphics.Bitmap b = android.graphics.Bitmap.createBitmap(96, 96, android.graphics.Bitmap.Config.ARGB_8888);
      android.graphics.Canvas c = new android.graphics.Canvas(b);
      d.setBounds(0, 0, 96, 96); d.draw(c);
      java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
      b.compress(android.graphics.Bitmap.CompressFormat.PNG, 90, out);
      String s = "data:image/png;base64," + android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP);
      return s.length() <= 24000 ? s : "";
    } catch (Exception e) { return ""; }
  }

  static String cut(CharSequence s, int n) { String t = s == null ? "" : s.toString(); return t.length() > n ? t.substring(0, n) : t; }

  static void send(String url, String auth, String json) {
    HttpURLConnection c = null;
    try {
      c = (HttpURLConnection) new URL(url).openConnection();
      c.setConnectTimeout(4000); c.setReadTimeout(4000); c.setRequestMethod("POST"); c.setDoOutput(true);
      c.setRequestProperty("Content-Type", "application/json"); c.setRequestProperty("Authorization", auth);
      try (OutputStream o = c.getOutputStream()) { o.write(json.getBytes("UTF-8")); }
      c.getResponseCode();
    } catch (Exception e) { /* PC away or asleep: the message is simply not shown there */ }
    finally { if (c != null) c.disconnect(); }
  }
}
