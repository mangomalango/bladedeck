package dev.bladedeck.app;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.app.RemoteInput;
import android.content.Intent;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONArray;
import org.json.JSONObject;

/* Messages to the PC: a notification from an app the owner ticked (and only those) goes to the
   paired Bladedeck as a bubble (phonemsg.js on the PC). Android asks the owner once to allow
   notification access. Nothing is sent until an app is ticked; ongoing ones (music, downloads),
   group summaries and Bladedeck's own are skipped. It goes only to the Bladedeck this phone is
   paired with, on the home network or Tailscale, and only the app name, the sender and up to 500
   characters of text. Apps that post notifications are remembered by name so the list can offer
   them; that list stays on the phone.
   Quick replies (BD-030): when the app lets its notification be answered (a reply action, like
   Messages, WhatsApp or Discord), the phone sends a random reference with it and keeps that reply
   action in memory only. For a few minutes it asks the PC for answers (/api/replies); an answer
   for one of its references is posted through the app's own reply action, but only if it is one of
   the four phrases below, so the PC can never make the phone send other words. */
public class NotifyService extends NotificationListenerService {
  static final String PREFS = "notify";
  static final List<String> REPLIES = Arrays.asList("Sounds good 👍", "Can't talk, busy right now", "Give me 5 mins", "In a match, be there soon!");
  static final long REPLY_MS = 3 * 60000L;
  static final class Pending { final Notification.Action action; final long at; Pending(Notification.Action a, long t) { action = a; at = t; } }
  static final Map<String, Pending> PENDING = new ConcurrentHashMap<>();
  static final SecureRandom RNG = new SecureRandom();
  static volatile boolean polling = false;

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
      Notification.Action reply = replyAction(n);
      if (reply != null) {
        prune();
        String ref = newRef();
        PENDING.put(ref, new Pending(reply, System.currentTimeMillis()));
        body.put("reply", ref);
      }
      final String json = body.toString(), url = base + "/api/notify", auth = "Bearer " + key;
      final boolean wait = reply != null;
      new Thread(() -> { send(url, auth, json); if (wait) poll(base, auth); }).start();
    } catch (Exception e) { /* never let a notification break the listener */ }
  }

  // The app's own "reply" action: one that takes typed text (a RemoteInput), on the notification or
  // on its watch extension (some chat apps only put it there).
  static Notification.Action replyAction(Notification n) {
    Notification.Action[][] sets = { n.actions, new Notification.WearableExtender(n).getActions().toArray(new Notification.Action[0]) };
    for (Notification.Action[] set : sets) {
      if (set == null) continue;
      for (Notification.Action a : set) {
        RemoteInput[] ins = a == null ? null : a.getRemoteInputs();
        if (ins == null || a.actionIntent == null) continue;
        for (RemoteInput r : ins) if (r.getAllowFreeFormInput()) return a;
      }
    }
    return null;
  }
  static String newRef() { byte[] b = new byte[12]; RNG.nextBytes(b); return android.util.Base64.encodeToString(b, android.util.Base64.URL_SAFE | android.util.Base64.NO_WRAP | android.util.Base64.NO_PADDING); }
  static void prune() {
    long old = System.currentTimeMillis() - REPLY_MS;
    for (Iterator<Map.Entry<String, Pending>> it = PENDING.entrySet().iterator(); it.hasNext();) if (it.next().getValue().at < old) it.remove();
    while (PENDING.size() > 30) { String k = PENDING.keySet().iterator().next(); PENDING.remove(k); }
  }

  // Asks the PC every 3 seconds while some message here can still be answered; one loop at a time.
  void poll(String base, String auth) {
    synchronized (NotifyService.class) { if (polling) return; polling = true; }
    try {
      while (true) {
        prune();
        if (PENDING.isEmpty()) break;
        String got = fetch(base + "/api/replies", auth);
        if (got != null) {
          JSONArray a = new JSONArray(got);
          for (int i = 0; i < a.length() && i < 10; i++) {
            JSONObject r = a.optJSONObject(i); if (r == null) continue;
            String text = r.optString("text", "");
            Pending p = PENDING.remove(r.optString("ref", ""));
            if (p != null && REPLIES.contains(text)) answer(p.action, text);
          }
        }
        Thread.sleep(3000);
      }
    } catch (Exception e) { /* PC away: the replies are simply not sent */ }
    finally { polling = false; }
  }
  // Fills the app's reply box with the phrase and presses its send, the same as replying from the shade.
  void answer(Notification.Action a, String text) {
    try {
      RemoteInput[] ins = a.getRemoteInputs();
      Bundle res = new Bundle();
      for (RemoteInput r : ins) res.putCharSequence(r.getResultKey(), text);
      Intent fill = new Intent();
      RemoteInput.addResultsToIntent(ins, fill, res);
      a.actionIntent.send(this, 0, fill);
    } catch (Exception e) { /* the app took its notification back: nothing to answer */ }
  }
  static String fetch(String url, String auth) {
    HttpURLConnection c = null;
    try {
      c = (HttpURLConnection) new URL(url).openConnection();
      c.setConnectTimeout(4000); c.setReadTimeout(4000); c.setRequestProperty("Authorization", auth);
      if (c.getResponseCode() != 200) return null;
      try (InputStream in = c.getInputStream()) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buf = new byte[4096]; int n;
        while ((n = in.read(buf)) > 0 && out.size() < 20000) out.write(buf, 0, n);
        return out.toString("UTF-8");
      }
    } catch (Exception e) { return null; }
    finally { if (c != null) c.disconnect(); }
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
