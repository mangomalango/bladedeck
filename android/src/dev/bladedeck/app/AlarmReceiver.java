package dev.bladedeck.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

/* A Bladedeck timer or alarm going off on the phone: a loud notification, even with the app
   closed. Bladedeck sends its timers and alarms over; MainActivity.schedule sets them here. */
public class AlarmReceiver extends BroadcastReceiver {
  static final String CHANNEL = "bladedeck-alarms";

  static void channel(Context c) {
    if (Build.VERSION.SDK_INT < 26) return;
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (nm.getNotificationChannel(CHANNEL) != null) return;
    NotificationChannel ch = new NotificationChannel(CHANNEL, "Timers and alarms", NotificationManager.IMPORTANCE_HIGH);
    ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
    ch.enableVibration(true);
    ch.setVibrationPattern(new long[] { 0, 600, 300, 600, 300, 600 });
    nm.createNotificationChannel(ch);
  }

  static void show(Context c, int id, String title, String text) {
    channel(c);
    Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE);
    Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
    b.setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(text).setAutoCancel(true).setContentIntent(pi)
      .setCategory(Notification.CATEGORY_ALARM).setPriority(Notification.PRIORITY_MAX);
    if (Build.VERSION.SDK_INT < 26) b.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)).setVibrate(new long[] { 0, 600, 300, 600 });
    Notification n = b.build();
    n.flags |= Notification.FLAG_INSISTENT; // keeps ringing until it is seen
    c.getSystemService(NotificationManager.class).notify(id, n);
  }

  @Override public void onReceive(Context c, Intent i) {
    show(c, i.getIntExtra("id", 1), i.getStringExtra("title"), i.getStringExtra("text"));
  }
}
