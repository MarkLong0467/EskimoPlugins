/*
 * Better Medias for Valenced, by MarkLong0467. The native half: the media notification (Android's MediaSession, with
 * play/pause, a seek bar, position and length), the small video player that keeps a video going while you move between
 * chats, Picture-in-Picture, and the hooks that keep Discord's players playing in the background and side by side.
 * The JavaScript half is js/ in this plugin. Every hook here is guarded: if Discord changes and something is not found, that
 * part stops working and the reason is written to the report, and Discord itself carries on.
 */
package marklong.bettermedias;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Outline;
import android.graphics.SurfaceTexture;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.util.Rational;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.lang.reflect.Field;
import java.lang.reflect.Member;
import java.lang.reflect.Method;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;

import app.valenced.bridge.ValencedBridge;
import app.valenced.plugins.PluginBuilder;
import app.valenced.plugins.PluginScope;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import kotlin.Unit;
import kotlin.coroutines.Continuation;
import kotlin.coroutines.intrinsics.IntrinsicsKt;
import kotlin.jvm.functions.Function1;
import kotlin.jvm.functions.Function2;

public final class BetterMedias {
    static final String PREFIX = "marklong.bettermedias.";
    static final String REGISTRY_KEY = "marklong.bettermedias.instance";
    static final String VERSION = "0.9.0";
    static final long WAIT_MS = 25000;
    static final String CHANNEL = "marklong_better_medias";
    static final int NOTIFICATION_ID = 0x4d454449; // "MEDI"
    static final String ACTION = "marklong.bettermedias.COMMAND";
    /** ActivityInfo.FLAG_SUPPORTS_PICTURE_IN_PICTURE, which Android keeps hidden. */
    static final int FLAG_SUPPORTS_PIP = 0x400000;
    static final String MINI = "mini";
    static final String NATIVE = "native";

    // ---- Settings (sent by the JavaScript half) --------------------------------------------------------------
    static volatile boolean bgVideo = true;
    static volatile boolean bgAudio = true;
    static volatile boolean bgVoice = true;
    static volatile boolean pipOn = true;
    static volatile boolean crossChat = true;
    static volatile boolean together = true;
    static volatile boolean notifyOn = true;

    /** Discord's window is on screen (between its onResume and onPause). */
    static volatile boolean foreground = true;
    /** In a voice or video call: Discord's own Picture-in-Picture is left to Discord. */
    static volatile boolean inCall = false;

    static final Handler main = new Handler(Looper.getMainLooper());
    static volatile Context app;
    static volatile WeakReference<Activity> activityRef = new WeakReference<Activity>(null);
    static volatile ClassLoader hostLoader;
    static final List<XC_MethodHook.Unhook> unhooks = new ArrayList<XC_MethodHook.Unhook>();
    static final Diag diag = new Diag();
    static volatile Actions actions;
    static volatile Session session;
    static volatile MiniView mini;
    static final Pip pip = new Pip();
    static volatile boolean running;

    static Activity activity() { return activityRef.get(); }

    static void post(final Runnable task) {
        main.post(new Runnable() {
            public void run() {
                try { task.run(); } catch (Throwable error) { diag.error("main", error); }
            }
        });
    }

    // =========================================================================================================
    // Report
    // =========================================================================================================
    static final class Diag {
        final List<String> notes = new ArrayList<String>();
        final Set<String> hooks = new LinkedHashSet<String>();
        final Set<String> listeners = new LinkedHashSet<String>();
        final List<String> pauses = new ArrayList<String>();
        final Map<String, Integer> counts = new LinkedHashMap<String, Integer>();
        long lastPauseAt;
        volatile String lastHandOff = "none yet";
        volatile String lastVideoSize = "none yet";

        synchronized void note(String text) {
            if (notes.size() < 40) notes.add(text);
        }

        synchronized void error(String where, Throwable error) {
            note(where + ": " + error.getClass().getSimpleName() + " " + String.valueOf(error.getMessage()));
        }

        synchronized void count(String key) {
            Integer n = counts.get(key);
            counts.put(key, n == null ? 1 : n + 1);
        }

        /** Who paused a player: the frames of the stack that are not Android's own. */
        synchronized void pausedBy(String what) {
            count("pause " + what);
            if (pauses.size() >= 8) return;
            long since = SystemClock.elapsedRealtime() - lastPauseAt;
            StringBuilder line = new StringBuilder();
            line.append(what).append(foreground ? " (Discord open" : " (Discord in background").append(", ").append(since).append(" ms after leaving, thread ").append(Thread.currentThread().getName()).append("): ");
            StackTraceElement[] stack = Thread.currentThread().getStackTrace();
            int kept = 0;
            for (StackTraceElement frame : stack) {
                String cls = frame.getClassName();
                if (cls.startsWith("java.") || cls.startsWith("dalvik.") || cls.startsWith("android.") || cls.startsWith("com.android.")
                    || cls.startsWith("de.robv.") || cls.startsWith("marklong.") || cls.startsWith("org.matrix.") || cls.startsWith("org.lsposed.")
                    || cls.contains("LSPHooker") || cls.contains("lsposed") || cls.contains("LSPatch") || cls.contains("lsplant") || cls.startsWith("kotlin.")) continue;
                if (kept++ > 0) line.append(" < ");
                line.append(cls).append('.').append(frame.getMethodName());
                if (kept >= 10) break;
            }
            pauses.add(line.toString());
        }

        synchronized String text() {
            StringBuilder out = new StringBuilder();
            out.append("native: ").append(VERSION).append(", Android ").append(Build.VERSION.RELEASE).append(" (SDK ").append(Build.VERSION.SDK_INT).append("), ")
                .append(Build.MANUFACTURER).append(' ').append(Build.MODEL).append('\n');
            out.append("settings: bgVideo=").append(bgVideo).append(" bgAudio=").append(bgAudio).append(" bgVoice=").append(bgVoice)
                .append(" pip=").append(pipOn).append(" crossChat=").append(crossChat).append(" together=").append(together)
                .append(" notification=").append(notifyOn).append('\n');
            out.append("state: foreground=").append(foreground).append(" inCall=").append(inCall).append(" activity=")
                .append(activity() == null ? "none" : activity().getClass().getName()).append('\n');
            Activity a = activity();
            out.append("picture-in-picture: ").append(Pip.supportText(a)).append(", wanted=").append(pip.wanted).append(", by=").append(pip.by).append('\n');
            out.append("hooks: ").append(hooks.isEmpty() ? "none" : hooks.toString()).append('\n');
            out.append("lifecycle listeners: ").append(listeners.isEmpty() ? "not seen yet (leave Discord once)" : listeners.toString()).append('\n');
            out.append("counts: ").append(counts.toString()).append('\n');
            out.append("chat player: ").append(Media.describe()).append('\n');
            out.append("ExoPlayer: ").append(Exo.info).append('\n');
            out.append("last Picture-in-Picture hand-off: ").append(lastHandOff).append(", chat video size: ").append(lastVideoSize).append('\n');
            Session s = session;
            out.append("notification: ").append(s == null ? "not made yet" : s.describe()).append('\n');
            MiniView m = mini;
            out.append("mini player: ").append(m == null ? "closed" : m.describe()).append('\n');
            out.append("pauses:").append(pauses.isEmpty() ? " none seen" : "").append('\n');
            for (String line : pauses) out.append("  ").append(line).append('\n');
            out.append("notes:").append(notes.isEmpty() ? " none" : "").append('\n');
            for (String line : notes) out.append("  ").append(line).append('\n');
            return out.toString();
        }
    }

    // =========================================================================================================
    // Actions for the JavaScript half (a long poll, as in Mute & Deafen Bubble)
    // =========================================================================================================
    static final class Actions {
        private final ArrayDeque<String> queue = new ArrayDeque<String>();
        private Continuation<Object> waiting;
        private Runnable timeout;

        void send(String action) {
            Continuation<Object> resume;
            synchronized (this) {
                resume = takeWaiter();
                if (resume == null) {
                    if (queue.size() < 32) queue.add(action);
                    return;
                }
            }
            resume.resumeWith(action);
        }

        @SuppressWarnings("unchecked")
        Object next(Continuation<?> continuation) {
            Continuation<Object> previous;
            synchronized (this) {
                String ready = queue.poll();
                if (ready != null) return ready;
                previous = takeWaiter();
                waiting = intercepted((Continuation<Object>) continuation);
                final Continuation<Object> mine = waiting;
                timeout = new Runnable() {
                    public void run() {
                        boolean expired;
                        synchronized (Actions.this) {
                            expired = waiting == mine;
                            if (expired) { waiting = null; timeout = null; }
                        }
                        if (expired) mine.resumeWith("none");
                    }
                };
                main.postDelayed(timeout, WAIT_MS);
            }
            if (previous != null) previous.resumeWith("none");
            return suspended();
        }

        private static Continuation<Object> intercepted(Continuation<Object> continuation) {
            try {
                return IntrinsicsKt.intercepted(continuation);
            } catch (LinkageError missing) {
                return continuation;
            }
        }

        @SuppressWarnings({"unchecked", "rawtypes"})
        private static Object suspended() {
            try {
                return IntrinsicsKt.getCOROUTINE_SUSPENDED();
            } catch (LinkageError missing) {
                try {
                    return Enum.valueOf((Class) Class.forName("kotlin.coroutines.intrinsics.CoroutineSingletons"), "COROUTINE_SUSPENDED");
                } catch (Throwable error) {
                    throw new IllegalStateException("Kotlin coroutines are not available", error);
                }
            }
        }

        private Continuation<Object> takeWaiter() {
            Continuation<Object> current = waiting;
            waiting = null;
            if (timeout != null) main.removeCallbacks(timeout);
            timeout = null;
            return current;
        }
    }

    // =========================================================================================================
    // The media notification (MediaSession). One piece of media at a time: the one playing most recently.
    // =========================================================================================================
    static final class Session {
        final Context context;
        final NotificationManager manager;
        MediaSession media;
        BroadcastReceiver receiver;
        String target;
        String title = "";
        String subtitle = "";
        long durationMs = -1;
        long positionMs;
        long positionAt;
        boolean playing;
        boolean canSeek;
        boolean shown;

        Session(Context context) {
            this.context = context;
            this.manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        }

        String describe() {
            return (shown ? "shown" : "hidden") + ", target=" + target + ", " + (playing ? "playing" : "paused") + " " + positionMs + "/" + durationMs + " ms, seek=" + canSeek;
        }

        long position() {
            long now = playing ? positionMs + (SystemClock.elapsedRealtime() - positionAt) : positionMs;
            return durationMs > 0 ? Math.min(now, durationMs) : now;
        }

        /** New state for one piece of media. A paused piece does not take the notification from one that is playing. */
        void update(String who, String newTitle, String newSubtitle, long duration, long position, boolean isPlaying, boolean seekable) {
            if (!notifyOn) { hide(); return; }
            if (target != null && !target.equals(who) && playing && !isPlaying) return;
            // Paused while Discord is on screen (not from the notification): the notification goes away, it is only kept for
            // media paused while Discord is in the background. Playing again brings it back.
            if (!isPlaying && foreground && SystemClock.elapsedRealtime() - commandAt > 3000) {
                if (shown && who.equals(target)) hideLater(who);
                else if (!who.equals(target)) return;
                if (!shown) return;
            }
            if (NATIVE.equals(who)) seekable = seekable || Media.canSeek();
            // Android moves the seek bar by itself while playing; the notification is only made again when something changes.
            boolean same = shown && who.equals(target) && isPlaying == playing && seekable == canSeek && duration == durationMs
                && String.valueOf(newTitle).equals(title) && String.valueOf(newSubtitle).equals(subtitle) && Math.abs(position() - position) < 1500;
            if (same) return;
            target = who;
            title = newTitle == null || newTitle.isEmpty() ? "Discord" : newTitle;
            subtitle = newSubtitle == null ? "" : newSubtitle;
            durationMs = duration;
            positionMs = Math.max(0, position);
            positionAt = SystemClock.elapsedRealtime();
            playing = isPlaying;
            canSeek = seekable;
            show();
        }

        void clear(String who) {
            if (who != null && who.equals(target)) hide();
        }

        /** When a command last came from the notification (a pause from there keeps the notification). */
        long commandAt;

        /** Hides the notification of media paused inside Discord, once it is clear Discord was not just being left. */
        void hideLater(final String who) {
            main.postDelayed(new Runnable() {
                public void run() {
                    try {
                        if (!foreground || playing || !who.equals(target) || SystemClock.elapsedRealtime() - commandAt < 3000) return;
                        hide();
                        diag.count("notification removed: paused inside Discord");
                    } catch (Throwable error) {
                        diag.error("hide after pause", error);
                    }
                }
            }, 1200);
        }

        void command(String cmd, long arg) {
            String who = target;
            if (who == null) return;
            diag.count("notification " + cmd);
            commandAt = SystemClock.elapsedRealtime();
            long to = -1;
            if ("back10".equals(cmd)) { to = Math.max(0, position() - 10000); cmd = "seek"; }
            else if ("fwd10".equals(cmd)) { to = durationMs > 0 ? Math.min(durationMs, position() + 10000) : position() + 10000; cmd = "seek"; }
            else if ("seek".equals(cmd)) to = arg;
            if ("toggle".equals(cmd)) cmd = playing ? "pause" : "play";
            if ("seek".equals(cmd)) {
                positionMs = to;
                positionAt = SystemClock.elapsedRealtime();
            }
            if (MINI.equals(who)) {
                MiniView m = mini;
                if (m != null) m.command(cmd, to);
            } else if (NATIVE.equals(who) && "seek".equals(cmd) && Media.seek(to)) {
                diag.count("chat player seek");
                show();
            } else {
                Actions queue = actions;
                if (queue != null) queue.send(cmd + ":" + who + ("seek".equals(cmd) ? ":" + to : ""));
            }
            if ("stop".equals(cmd)) hide();
            else if ("play".equals(cmd) || "pause".equals(cmd)) {
                // Show the new state at once; the player sends its real state right after.
                positionMs = position();
                positionAt = SystemClock.elapsedRealtime();
                playing = "play".equals(cmd);
                show();
            } else show();
        }

        private void ensure() {
            if (media != null) return;
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel channel = new NotificationChannel(CHANNEL, "Media playback", NotificationManager.IMPORTANCE_LOW);
                channel.setDescription("Play, pause and seek videos and audio from Discord (Better Medias)");
                channel.setShowBadge(false);
                manager.createNotificationChannel(channel);
            }
            media = new MediaSession(context, "BetterMedias");
            media.setCallback(new MediaSession.Callback() {
                @Override public void onPlay() { command("play", -1); }
                @Override public void onPause() { command("pause", -1); }
                @Override public void onStop() { command("stop", -1); }
                @Override public void onSeekTo(long pos) { command("seek", pos); }
                @Override public void onRewind() { command("back10", -1); }
                @Override public void onFastForward() { command("fwd10", -1); }
                @Override public void onSkipToPrevious() { command("back10", -1); }
                @Override public void onSkipToNext() { command("fwd10", -1); }
            }, main);
            receiver = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent intent) {
                    try { command(String.valueOf(intent.getStringExtra("cmd")), -1); } catch (Throwable error) { diag.error("notification button", error); }
                }
            };
            IntentFilter filter = new IntentFilter(ACTION);
            if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, 4 /* RECEIVER_NOT_EXPORTED */);
            else context.registerReceiver(receiver, filter);
        }

        private PendingIntent commandIntent(String cmd, int code) {
            Intent intent = new Intent(ACTION).setPackage(context.getPackageName()).putExtra("cmd", cmd);
            return PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        private PendingIntent openIntent() {
            Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (launch == null) return null;
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            return PendingIntent.getActivity(context, 77, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        private int smallIcon() {
            String pkg = context.getPackageName();
            String[] names = {"ic_notification_24dp", "ic_notification", "ic_stat_discord", "ic_notification_white"};
            for (String name : names) {
                int id = context.getResources().getIdentifier(name, "drawable", pkg);
                if (id != 0) return id;
            }
            return android.R.drawable.ic_media_play;
        }

        private Notification.Action action(int icon, String label, String cmd, int code) {
            return new Notification.Action.Builder(Icon.createWithResource("android", icon), label, commandIntent(cmd, code)).build();
        }

        void show() {
            if (!notifyOn || target == null) return;
            ensure();
            long position = position();
            long actionsMask = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP
                | PlaybackState.ACTION_REWIND | PlaybackState.ACTION_FAST_FORWARD | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SKIP_TO_NEXT;
            if (canSeek) actionsMask |= PlaybackState.ACTION_SEEK_TO;
            media.setPlaybackState(new PlaybackState.Builder()
                .setActions(actionsMask)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, position, playing ? 1f : 0f, SystemClock.elapsedRealtime())
                .build());
            media.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle)
                .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, subtitle)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs > 0 ? durationMs : -1)
                .build());
            media.setActive(true);
            Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL) : new Notification.Builder(context);
            builder.setSmallIcon(smallIcon())
                .setContentTitle(title)
                .setContentText(subtitle)
                .setOngoing(playing)
                .setShowWhen(false)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setDeleteIntent(commandIntent("stop", 5))
                .addAction(action(android.R.drawable.ic_media_rew, "Back 10 seconds", "back10", 1))
                .addAction(playing ? action(android.R.drawable.ic_media_pause, "Pause", "pause", 2) : action(android.R.drawable.ic_media_play, "Play", "play", 3))
                .addAction(action(android.R.drawable.ic_media_ff, "Forward 10 seconds", "fwd10", 4))
                .setStyle(new Notification.MediaStyle().setMediaSession(media.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
            PendingIntent open = openIntent();
            if (open != null) builder.setContentIntent(open);
            try {
                manager.notify(NOTIFICATION_ID, builder.build());
                shown = true;
            } catch (Throwable error) {
                diag.error("notification", error);
            }
        }

        void hide() {
            target = null;
            playing = false;
            shown = false;
            try { manager.cancel(NOTIFICATION_ID); } catch (Throwable ignored) {}
            if (media != null) try { media.setActive(false); } catch (Throwable ignored) {}
        }

        void release() {
            hide();
            if (media != null) try { media.release(); } catch (Throwable ignored) {}
            media = null;
            if (receiver != null) try { context.unregisterReceiver(receiver); } catch (Throwable ignored) {}
            receiver = null;
        }
    }

    static Session session() {
        Session s = session;
        if (s == null && app != null) session = s = new Session(app);
        return s;
    }

    // =========================================================================================================
    // The small video player that floats over Discord's own window (no permission needed): it takes over a video you
    // leave while it plays, keeps playing while you move between chats, and fills the Picture-in-Picture window.
    // =========================================================================================================
    static final class MiniView extends FrameLayout implements TextureView.SurfaceTextureListener {
        final TextureView texture;
        final TextView badge;
        final TextView close;
        MediaPlayer player;
        Surface surface;
        String url = "";
        String title = "";
        boolean prepared;
        boolean wantPlay;
        long startAt;
        int videoW = 16;
        int videoH = 9;
        boolean filling;
        boolean audioOnly;
        /** Whether videoW x videoH is the video's real size (not the 16:9 placeholder). */
        boolean sizeKnown;
        final Matrix fit = new Matrix();
        float downX, downY, startTX, startTY;
        boolean dragged;
        final int touchSlop;
        final Runnable ticker = new Runnable() {
            public void run() {
                report();
                if (player != null && isPlaying()) main.postDelayed(this, 1000);
            }
        };

        @SuppressLint("SetTextI18n")
        MiniView(Context context) {
            super(context);
            touchSlop = ViewConfiguration.get(context).getScaledTouchSlop();
            setBackgroundColor(Color.BLACK);
            setElevation(dp(12));
            setClipToOutline(true);
            setOutlineProvider(new ViewOutlineProvider() {
                @Override public void getOutline(View view, Outline outline) {
                    outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), filling ? 0 : dp(12));
                }
            });
            texture = new TextureView(context);
            texture.setSurfaceTextureListener(this);
            addView(texture, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
            texture.addOnLayoutChangeListener(new OnLayoutChangeListener() {
                @Override public void onLayoutChange(View v, int l, int t, int r, int b, int ol, int ot, int or, int ob) { fitVideo(); }
            });
            badge = new TextView(context);
            badge.setTextColor(Color.WHITE);
            badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 30);
            badge.setShadowLayer(dp(4), 0, 0, Color.BLACK);
            badge.setGravity(Gravity.CENTER);
            addView(badge, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
            close = new TextView(context);
            close.setText("✕");
            close.setTextColor(Color.WHITE);
            close.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            close.setGravity(Gravity.CENTER);
            GradientDrawable round = new GradientDrawable();
            round.setShape(GradientDrawable.OVAL);
            round.setColor(0x99000000);
            close.setBackground(round);
            close.setContentDescription("Close the video");
            LayoutParams closeAt = new LayoutParams(dp(28), dp(28), Gravity.TOP | Gravity.END);
            closeAt.setMargins(0, dp(6), dp(6), 0);
            addView(close, closeAt);
            close.setOnClickListener(new OnClickListener() {
                @Override public void onClick(View v) { closeMini(); }
            });
            setContentDescription("Video playing. Tap to pause or play, drag to move.");
        }

        int dp(float value) {
            return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
        }

        String describe() {
            return (isPlaying() ? "playing " : "paused ") + position() + "/" + duration() + " ms, " + videoW + "x" + videoH + (filling ? ", filling the window" : "");
        }

        boolean isPlaying() {
            try { return player != null && prepared && player.isPlaying(); } catch (Throwable error) { return false; }
        }

        long position() {
            try { return player != null && prepared ? player.getCurrentPosition() : startAt; } catch (Throwable error) { return 0; }
        }

        long duration() {
            try { return player != null && prepared ? player.getDuration() : -1; } catch (Throwable error) { return -1; }
        }

        void open(String newUrl, long positionMs, String newTitle, boolean play) {
            release();
            url = newUrl;
            title = newTitle == null || newTitle.isEmpty() ? "Video" : newTitle;
            String bare = newUrl == null ? "" : (newUrl.indexOf('?') >= 0 ? newUrl.substring(0, newUrl.indexOf('?')) : newUrl).toLowerCase();
            audioOnly = bare.matches(".*\\.(mp3|ogg|oga|opus|flac|wav|m4a|aac|wma)$") || "Voice message".equals(title);
            badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, audioOnly ? 14 : 30);
            sizeKnown = false;
            if (newUrl != null && newUrl.equals(Media.probedUrl) && Media.probedW > 0 && Media.probedH > 0) {
                videoW = Media.probedW;
                videoH = Media.probedH;
                sizeKnown = true;
            }
            layoutMini();
            startAt = Math.max(0, positionMs);
            wantPlay = play;
            prepared = false;
            final MediaPlayer mp = new MediaPlayer();
            player = mp;
            mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build());
            mp.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                @Override public void onPrepared(MediaPlayer p) {
                    if (p != player) return;
                    prepared = true;
                    if (startAt > 0) seekTo(startAt);
                    if (wantPlay) p.start();
                    refresh();
                }
            });
            mp.setOnVideoSizeChangedListener(new MediaPlayer.OnVideoSizeChangedListener() {
                @Override public void onVideoSizeChanged(MediaPlayer p, int width, int height) {
                    if (width > 0 && height > 0 && !audioOnly) {
                        videoW = width;
                        videoH = height;
                        sizeKnown = true;
                        layoutMini();
                        fitVideo();
                        pip.set(MINI, isPlaying(), videoW, videoH);
                        fitPip();
                    }
                }
            });
            mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override public void onCompletion(MediaPlayer p) { refresh(); }
            });
            mp.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override public boolean onError(MediaPlayer p, int what, int extra) {
                    diag.note("mini player error " + what + "/" + extra + " for " + shortUrl(url));
                    closeMini();
                    return true;
                }
            });
            try {
                mp.setDataSource(getContext(), Uri.parse(url));
                if (surface != null) mp.setSurface(surface);
                mp.prepareAsync();
            } catch (Throwable error) {
                diag.error("mini player open", error);
                closeMini();
                return;
            }
            refresh();
        }

        /** The video keeps its shape inside the player (black bars instead of stretching). */
        void fitVideo() {
            int vw = texture.getWidth(), vh = texture.getHeight();
            if (vw <= 0 || vh <= 0 || videoW <= 0 || videoH <= 0) return;
            float scale = Math.min(vw / (float) videoW, vh / (float) videoH);
            fit.reset();
            fit.setScale(videoW * scale / vw, videoH * scale / vh, vw / 2f, vh / 2f);
            texture.setTransform(fit);
            texture.invalidate();
        }

        /** In Picture-in-Picture, the window takes the video's shape. */
        void fitPip() {
            if (audioOnly || !sizeKnown || videoW <= 0 || videoH <= 0) return;
            pip.w = videoW;
            pip.h = videoH;
            shapeWindow();
            // Android can ignore a new shape while the window is still growing into Picture-in-Picture: say it again after.
            main.postDelayed(new Runnable() { public void run() { if (mini == MiniView.this) shapeWindow(); } }, 800);
        }

        void shapeWindow() {
            Activity a = activity();
            if (a == null || Build.VERSION.SDK_INT < 26 || !sizeKnown) return;
            try {
                if (a.isInPictureInPictureMode()) {
                    a.setPictureInPictureParams(pip.params(pip.active()));
                    diag.count("Picture-in-Picture shaped to the video");
                }
            } catch (Throwable error) {
                diag.error("pip shape", error);
            }
        }

        void seekTo(long ms) {
            if (player == null) return;
            try {
                if (Build.VERSION.SDK_INT >= 26) player.seekTo(ms, MediaPlayer.SEEK_CLOSEST);
                else player.seekTo((int) ms);
            } catch (Throwable error) { diag.error("mini seek", error); }
        }

        void command(String cmd, long arg) {
            if (player == null) return;
            try {
                if ("play".equals(cmd)) { wantPlay = true; if (prepared) player.start(); }
                else if ("pause".equals(cmd)) { wantPlay = false; if (prepared) player.pause(); }
                else if ("toggle".equals(cmd)) { command(isPlaying() ? "pause" : "play", arg); return; }
                else if ("seek".equals(cmd) && arg >= 0) { if (prepared) seekTo(arg); else startAt = arg; }
                else if ("stop".equals(cmd) || "close".equals(cmd)) { closeMini(); return; }
            } catch (Throwable error) {
                diag.error("mini " + cmd, error);
            }
            refresh();
        }

        void refresh() {
            boolean going = isPlaying() || (wantPlay && !prepared);
            if (audioOnly) badge.setText((going ? "♪  " : "▶  ") + title);
            else badge.setText(going ? "" : "▶");
            report();
            main.removeCallbacks(ticker);
            if (isPlaying()) main.postDelayed(ticker, 1000);
            pip.set(MINI, isPlaying() && !audioOnly, sizeKnown ? videoW : 0, sizeKnown ? videoH : 0);
        }

        void report() {
            Session s = session();
            if (s != null) s.update(MINI, title, audioOnly ? "Discord" : "Discord video", duration(), position(), isPlaying() || (wantPlay && !prepared), true);
        }

        void layoutMini() {
            Activity a = activity();
            boolean inPip = a != null && Build.VERSION.SDK_INT >= 24 && a.isInPictureInPictureMode();
            filling = inPip;
            close.setVisibility(inPip ? GONE : VISIBLE);
            ViewGroup.LayoutParams current = getLayoutParams();
            if (!(current instanceof FrameLayout.LayoutParams)) return;
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) current;
            if (inPip) {
                lp.width = ViewGroup.LayoutParams.MATCH_PARENT;
                lp.height = ViewGroup.LayoutParams.MATCH_PARENT;
                lp.setMargins(0, 0, 0, 0);
                setTranslationX(0);
                setTranslationY(0);
            } else {
                DisplayMetrics metrics = getResources().getDisplayMetrics();
                int width = Math.round(Math.min(metrics.widthPixels, metrics.heightPixels) * 0.56f);
                int height = audioOnly ? dp(52) : Math.round(width * (videoH / (float) videoW));
                int maxH = Math.round(metrics.heightPixels * 0.45f);
                if (!audioOnly && height > maxH) { height = maxH; width = Math.round(height * (videoW / (float) videoH)); }
                lp.width = width;
                lp.height = height;
                lp.gravity = Gravity.BOTTOM | Gravity.END;
                lp.setMargins(0, 0, dp(12), dp(150));
            }
            setLayoutParams(lp);
            invalidateOutline();
        }

        @Override protected void onConfigurationChanged(Configuration newConfig) {
            super.onConfigurationChanged(newConfig);
            post(new Runnable() { public void run() { layoutMini(); } });
        }

        @SuppressLint("ClickableViewAccessibility")
        @Override public boolean onTouchEvent(MotionEvent event) {
            if (filling) return false;
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = event.getRawX(); downY = event.getRawY();
                    startTX = getTranslationX(); startTY = getTranslationY();
                    dragged = false;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    float dx = event.getRawX() - downX, dy = event.getRawY() - downY;
                    if (!dragged && Math.hypot(dx, dy) > touchSlop) dragged = true;
                    if (dragged) { setTranslationX(startTX + dx); setTranslationY(startTY + dy); }
                    return true;
                case MotionEvent.ACTION_UP:
                    if (!dragged) command("toggle", -1);
                    return true;
                default:
                    return true;
            }
        }

        @Override public void onSurfaceTextureAvailable(SurfaceTexture st, int width, int height) {
            surface = new Surface(st);
            if (player != null) try { player.setSurface(surface); } catch (Throwable error) { diag.error("mini surface", error); }
        }

        @Override public void onSurfaceTextureSizeChanged(SurfaceTexture st, int width, int height) {}

        @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture st) {
            if (player != null) try { player.setSurface(null); } catch (Throwable ignored) {}
            if (surface != null) surface.release();
            surface = null;
            return true;
        }

        @Override public void onSurfaceTextureUpdated(SurfaceTexture st) {}

        void release() {
            main.removeCallbacks(ticker);
            MediaPlayer old = player;
            player = null;
            prepared = false;
            if (old != null) try { old.release(); } catch (Throwable ignored) {}
        }

        /** Puts the player on top of an activity's own window. */
        void attachTo(Activity a) {
            if (a == null) return;
            ViewGroup decor = (ViewGroup) a.getWindow().getDecorView();
            if (getParent() == decor) return;
            if (getParent() instanceof ViewGroup) ((ViewGroup) getParent()).removeView(this);
            decor.addView(this, new FrameLayout.LayoutParams(1, 1, Gravity.BOTTOM | Gravity.END));
            layoutMini();
        }
    }

    static String shortUrl(String url) {
        if (url == null) return "";
        int q = url.indexOf('?');
        String bare = q >= 0 ? url.substring(0, q) : url;
        return bare.length() > 80 ? "..." + bare.substring(bare.length() - 77) : bare;
    }

    static void openMini(final String url, final long positionMs, final String title, final boolean play) {
        post(new Runnable() {
            public void run() {
                Activity a = activity();
                if (a == null || app == null) { diag.note("mini player: no activity"); return; }
                MiniView m = mini;
                if (m == null) mini = m = new MiniView(a);
                m.attachTo(a);
                m.open(url, positionMs, title, play);
                diag.count("mini opened");
            }
        });
    }

    static void closeMini() {
        MiniView m = mini;
        mini = null;
        if (m == null) return;
        m.release();
        if (m.getParent() instanceof ViewGroup) ((ViewGroup) m.getParent()).removeView(m);
        Session s = session;
        if (s != null) s.clear(MINI);
        pip.set(MINI, false, 16, 9);
    }

    // =========================================================================================================
    // Picture-in-Picture. Discord's activity already allows it (Discord uses it for calls); a playing video asks for it.
    // =========================================================================================================
    static final class Pip {
        volatile boolean wanted;
        volatile String by = "";
        volatile int w = 16;
        volatile int h = 9;
        volatile boolean ownsAutoEnter;

        static boolean supported(Activity a) {
            if (a == null || Build.VERSION.SDK_INT < 26) return false;
            try {
                ActivityInfo info = a.getPackageManager().getActivityInfo(a.getComponentName(), 0);
                return (info.flags & FLAG_SUPPORTS_PIP) != 0;
            } catch (Throwable error) {
                return false;
            }
        }

        static String supportText(Activity a) {
            if (Build.VERSION.SDK_INT < 26) return "needs Android 8";
            if (a == null) return "unknown (no activity yet)";
            return supported(a) ? "supported by Discord's window" : "not allowed by Discord's window";
        }

        /** A player says whether it is playing a video (the one asking last wins while it plays). */
        void set(String who, boolean playing, int width, int height) {
            boolean before = wanted;
            String beforeBy = by;
            int beforeW = w, beforeH = h;
            if (playing) {
                by = who;
                wanted = true;
                if (width > 0 && height > 0) { w = width; h = height; }
            } else if (who.equals(by)) {
                wanted = false;
            }
            if (before == wanted && beforeBy.equals(by) && beforeW == w && beforeH == h) return;
            post(new Runnable() { public void run() { apply(); } });
        }

        PictureInPictureParams params(boolean autoEnter) {
            float ratio = h > 0 ? w / (float) h : 16f / 9f;
            int rw = w, rh = h;
            if (ratio > 2.39f) { rw = 239; rh = 100; }
            else if (ratio < 1 / 2.39f) { rw = 100; rh = 239; }
            PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder().setAspectRatio(new Rational(Math.max(1, rw), Math.max(1, rh)));
            if (Build.VERSION.SDK_INT >= 31) builder.setAutoEnterEnabled(autoEnter).setSeamlessResizeEnabled(true);
            return builder.build();
        }

        boolean active() { return pipOn && wanted && !inCall; }

        /** Android 12 and newer: let Android enter Picture-in-Picture by itself when Discord is left while a video plays. */
        void apply() {
            if (Build.VERSION.SDK_INT < 31) return;
            Activity a = activity();
            if (a == null || !supported(a)) return;
            boolean on = active();
            if (!on && !ownsAutoEnter) return; // never touch what Discord set for its calls
            try {
                a.setPictureInPictureParams(params(on));
                ownsAutoEnter = on;
            } catch (Throwable error) {
                diag.error("pip params", error);
            }
        }

        /** Android 8 to 11: enter Picture-in-Picture when the user leaves Discord (home or recent apps). */
        void onUserLeaveHint(Activity a) {
            if (Build.VERSION.SDK_INT < 26 || Build.VERSION.SDK_INT >= 31 || !active() || !supported(a)) return;
            try {
                if (!a.isInPictureInPictureMode()) {
                    a.enterPictureInPictureMode(params(false));
                    diag.count("pip entered");
                }
            } catch (Throwable error) {
                diag.error("pip enter", error);
            }
        }
    }

    // =========================================================================================================
    // Discord's player for media inside chats (NativeModules.MediaPlayerManager: audio files, voice messages, videos).
    // Discord tells it to pause everything whenever another chat opens (pauseAllMediaPlayers); with "Keep videos playing
    // across chats" on, that call is skipped. Its player is looked for so the notification can seek.
    // =========================================================================================================
    static final class Media {
        static final String NAME = "MediaPlayerManager";
        /** The chat video that plays now (from the JavaScript half): Picture-in-Picture shows it in the small player. */
        static volatile String videoUrl = "";
        static volatile String videoTitle = "";
        static volatile long videoPosMs;
        static volatile long videoAt;
        static volatile boolean videoPlaying;
        static volatile long videoPlayedAt;
        /** What Discord's chat player plays now (from the JavaScript half), to find its ExoPlayer. */
        static volatile String sourceUrl = "";

        static volatile String probedUrl = "";
        static volatile int probedW, probedH;

        /** The video's own width and height (read from the file in the background), so Picture-in-Picture opens in its shape. */
        static void probeSize(final String url) {
            if (url.equals(probedUrl)) return;
            probedUrl = url;
            probedW = 0;
            probedH = 0;
            new Thread(new Runnable() {
                public void run() {
                    android.media.MediaMetadataRetriever r = new android.media.MediaMetadataRetriever();
                    try {
                        r.setDataSource(url, new java.util.HashMap<String, String>());
                        int w = Integer.parseInt(String.valueOf(r.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)));
                        int h = Integer.parseInt(String.valueOf(r.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)));
                        String rot = r.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
                        if ("90".equals(rot) || "270".equals(rot)) { int t = w; w = h; h = t; }
                        if (w > 0 && h > 0) { probedW = w; probedH = h; }
                        if (w > 0 && h > 0 && url.equals(videoUrl)) {
                            pip.w = w;
                            pip.h = h;
                            diag.lastVideoSize = w + "x" + h;
                            post(new Runnable() { public void run() { pip.apply(); } });
                        }
                    } catch (Throwable error) {
                        diag.lastVideoSize = "could not read: " + error.getClass().getSimpleName();
                    } finally {
                        try { r.release(); } catch (Throwable ignored) {}
                    }
                }
            }, "BetterMedias-probe").start();
        }

        static long videoPosition() {
            return videoPlaying ? videoPosMs + (SystemClock.elapsedRealtime() - videoAt) : videoPosMs;
        }

        /** Leaving Discord while a chat video plays: the small player takes it over (it fills the Picture-in-Picture window). */
        static void handOffForPip(Activity a) {
            long now = SystemClock.elapsedRealtime();
            boolean recently = videoPlaying || now - videoPlayedAt < 5000;
            if (!pipOn || inCall || !recently || videoUrl.isEmpty() || !Pip.supported(a)) {
                diag.lastHandOff = "skipped: pip=" + pipOn + " inCall=" + inCall + " playing=" + videoPlaying + " playedAgo=" + (now - videoPlayedAt) + " url=" + !videoUrl.isEmpty();
                return;
            }
            MiniView m = mini;
            if (m != null && videoUrl.equals(m.url)) return;
            openMini(videoUrl, videoPosition(), videoTitle, true);
            diag.lastHandOff = "handed over at " + videoPosition() + " ms";
            Actions queue = actions;
            if (queue != null) queue.send("handoff:native");
            videoPlaying = false;
            diag.count("chat video to Picture-in-Picture");
        }
        static volatile Object module;
        static volatile String how = "not looked for yet (open Discord once)";
        static volatile Object player;
        static volatile Method seekMethod;
        static volatile String playerInfo = "not looked for yet";
        static volatile long lookedAt;
        static final Set<Class<?>> hookedClasses = new LinkedHashSet<Class<?>>();

        static boolean hasMethod(Class<?> cls, String name) {
            for (Class<?> c = cls; c != null && c != Object.class; c = c.getSuperclass()) {
                try { for (Method m : c.getDeclaredMethods()) if (m.getName().equals(name)) return true; } catch (Throwable ignored) {}
            }
            return false;
        }

        /** Is this lifecycle listener Discord's chat player (or a part of it)? */
        static boolean isMediaListener(Object listener) {
            if (listener == null) return false;
            Object m = module;
            if (m != null && listener == m) return true;
            Class<?> cls = listener.getClass();
            if (hasMethod(cls, "pauseAllMediaPlayers") || hasMethod(cls, "playCurrentPlayer")) {
                adopt(listener, "lifecycle listeners");
                return true;
            }
            try {
                Class<?> outer = cls.getEnclosingClass();
                if (m != null && outer != null && outer == m.getClass()) return true;
            } catch (Throwable ignored) {}
            return false;
        }

        static void find(Object reactContext) {
            if (module != null || reactContext == null) return;
            Object found = null;
            try {
                Method get = method(reactContext.getClass(), "getNativeModule", String.class);
                if (get != null) found = get.invoke(reactContext, NAME);
            } catch (Throwable ignored) {}
            if (found == null) {
                try {
                    Method catalyst = method(reactContext.getClass(), "getCatalystInstance");
                    Object instance = catalyst == null ? null : catalyst.invoke(reactContext);
                    Method get = instance == null ? null : method(instance.getClass(), "getNativeModule", String.class);
                    if (get != null) found = get.invoke(instance, NAME);
                } catch (Throwable ignored) {}
            }
            if (found != null) adopt(found, "React context");
            else how = "not found in the React context";
        }

        static synchronized void adopt(Object m, String where) {
            if (module != null) return;
            module = m;
            how = m.getClass().getName() + " (from " + where + ")";
            hookPauseAll(m.getClass());
        }

        static void hookPauseAll(Class<?> cls) {
            synchronized (hookedClasses) { if (!hookedClasses.add(cls)) return; }
            for (Class<?> c = cls; c != null && c != Object.class; c = c.getSuperclass()) {
                Method[] methods;
                try { methods = c.getDeclaredMethods(); } catch (Throwable error) { continue; }
                for (Method m : methods) {
                    if (!m.getName().equals("pauseAllMediaPlayers") || java.lang.reflect.Modifier.isAbstract(m.getModifiers())) continue;
                    hook("MediaPlayerManager.pauseAllMediaPlayers", m, new XC_MethodHook() {
                        @Override protected void beforeHookedMethod(MethodHookParam param) {
                            if (!crossChat) return;
                            param.setResult(null);
                            diag.count("chat change: kept playing (native)");
                        }
                    });
                }
            }
        }

        static Method seekOf(Class<?> cls) {
            Method best = null;
            try {
                for (Method m : cls.getMethods()) {
                    if (!m.getName().equals("seekTo") || m.getParameterTypes().length != 1) continue;
                    Class<?> t = m.getParameterTypes()[0];
                    if (t == long.class) return m;
                    if (t == int.class) best = m;
                }
            } catch (Throwable ignored) {}
            return best;
        }

        static boolean skip(Object o) {
            if (o == null || o instanceof String || o instanceof Number || o instanceof Boolean || o instanceof Character || o instanceof Class
                || o instanceof Context || o instanceof View || o instanceof Thread || o instanceof ClassLoader || o instanceof Handler || o instanceof Looper) return true;
            String n = o.getClass().getName();
            return n.startsWith("com.facebook.react.") || n.startsWith("java.lang.reflect.") || n.startsWith("kotlin.jvm.");
        }

        static void scan(Object o, int depth, IdentityHashMap<Object, Boolean> seen, Object[] hit) {
            if (hit[0] != null || depth > 4 || skip(o) || seen.containsKey(o) || seen.size() > 4000) return;
            seen.put(o, Boolean.TRUE);
            if (depth > 0) {
                Method s = seekOf(o.getClass());
                if (s != null) { hit[0] = o; hit[1] = s; return; }
            }
            if (o instanceof Collection) {
                int i = 0;
                try { for (Object v : (Collection<?>) o) { if (i++ > 30) break; scan(v, depth + 1, seen, hit); } } catch (Throwable ignored) {}
                return;
            }
            if (o instanceof Map) {
                int i = 0;
                try { for (Object v : ((Map<?, ?>) o).values()) { if (i++ > 30) break; scan(v, depth + 1, seen, hit); } } catch (Throwable ignored) {}
                return;
            }
            if (o instanceof Object[]) {
                Object[] array = (Object[]) o;
                for (int i = 0; i < array.length && i < 30; i++) scan(array[i], depth + 1, seen, hit);
                return;
            }
            if (o.getClass().isArray()) return;
            for (Class<?> c = o.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
                String n = c.getName();
                if (n.startsWith("java.") || n.startsWith("android.")) break;
                Field[] fields;
                try { fields = c.getDeclaredFields(); } catch (Throwable error) { continue; }
                for (Field f : fields) {
                    if (f.getType().isPrimitive() || java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
                    try {
                        f.setAccessible(true);
                        scan(f.get(o), depth + 1, seen, hit);
                    } catch (Throwable ignored) {}
                    if (hit[0] != null) return;
                }
            }
        }

        /** Looks for the chat player's own player (something with seekTo); at most every 3 seconds. */
        static void look(boolean force) {
            Object m = module;
            if (m == null) { playerInfo = "chat player not found"; return; }
            long now = SystemClock.elapsedRealtime();
            if (!force && now - lookedAt < 3000) return;
            lookedAt = now;
            try {
                IdentityHashMap<Object, Boolean> seen = new IdentityHashMap<Object, Boolean>();
                Object[] hit = new Object[2];
                scan(m, 0, seen, hit);
                if (hit[0] != null) {
                    player = hit[0];
                    seekMethod = (Method) hit[1];
                    playerInfo = player.getClass().getName() + "." + seekMethod.getName() + "(" + seekMethod.getParameterTypes()[0].getName() + ")";
                } else {
                    player = null;
                    seekMethod = null;
                    playerInfo = "nothing with seekTo found (" + seen.size() + " objects looked at)";
                }
            } catch (Throwable error) {
                playerInfo = "error " + error;
            }
        }

        static boolean canSeek() {
            if (player == null) look(false);
            return player != null && seekMethod != null;
        }

        static boolean seek(final long ms) {
            if (ms < 0) return false;
            if (Exo.seek(ms)) return true;
            look(true);
            final Object p = player;
            final Method s = seekMethod;
            if (p == null || s == null) return false;
            post(new Runnable() {
                public void run() {
                    try {
                        if (s.getParameterTypes()[0] == long.class) s.invoke(p, ms);
                        else s.invoke(p, (int) ms);
                    } catch (Throwable error) {
                        diag.error("chat player seek", error instanceof java.lang.reflect.InvocationTargetException && error.getCause() != null ? error.getCause() : error);
                    }
                }
            });
            return true;
        }

        static String describe() {
            Object m = module;
            StringBuilder out = new StringBuilder(how);
            if (m != null) {
                List<String> names = new ArrayList<String>();
                try { for (Method x : m.getClass().getDeclaredMethods()) if (names.size() < 45 && !names.contains(x.getName())) names.add(x.getName()); } catch (Throwable ignored) {}
                out.append("; methods ").append(names).append("; seek: ").append(playerInfo);
                try {
                    for (Method x : m.getClass().getDeclaredMethods()) {
                        if (!x.getName().equals("changeProgress")) continue;
                        out.append("; changeProgress(");
                        Class<?>[] types = x.getParameterTypes();
                        for (int i = 0; i < types.length; i++) out.append(i > 0 ? "," : "").append(types[i].getSimpleName());
                        out.append(")");
                    }
                } catch (Throwable ignored) {}
                try {
                    List<String> fields = new ArrayList<String>();
                    for (Field f : m.getClass().getDeclaredFields()) {
                        if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
                        f.setAccessible(true);
                        Object v = f.get(m);
                        String text = f.getName() + ":" + (v == null ? "null" : v.getClass().getName());
                        if (v instanceof Map) {
                            List<String> keys = new ArrayList<String>();
                            for (Object k : ((Map<?, ?>) v).keySet()) { if (keys.size() >= 4) break; keys.add(String.valueOf(k)); }
                            text += "{" + ((Map<?, ?>) v).size() + " " + keys + "}";
                        }
                        fields.add(text);
                    }
                    out.append("; fields ").append(fields);
                } catch (Throwable ignored) {}
                out.append("; chat video: ").append(videoUrl.isEmpty() ? "none" : shortUrl(videoUrl) + (videoPlaying ? " playing" : " paused"));
            }
            return out.toString();
        }
    }


    // =========================================================================================================
    // Discord's chat player is ExoPlayer (its "ExoPlayer:Playback" thread shows in the pause stacks). Its names are
    // shortened, so it is found by shape:
    // - The playback thread's handler (the class whose handleMessage is on that thread's stack) is hooked to learn which
    //   player instances are busy playing: message 2 is ExoPlayer's "do some work", sent over and over while playing.
    // - The player itself is reached from there (fields) and has seekTo(int item, long ms, int command, boolean).
    // =========================================================================================================
    static final class Exo {
        static volatile Class<?> internalClass;
        static volatile String info = "not seen yet (play something once)";
        static final java.util.WeakHashMap<Object, Long> lastWork = new java.util.WeakHashMap<Object, Long>();
        static final java.util.WeakHashMap<Object, Object[]> players = new java.util.WeakHashMap<Object, Object[]>();

        /** Called on an ExoPlayer thread (from the AudioTrack hooks): finds and hooks the playback handler once. */
        static void discover() {
            if (internalClass != null) return;
            String name = Thread.currentThread().getName();
            if (name == null || !name.startsWith("ExoPlayer")) return;
            for (StackTraceElement frame : Thread.currentThread().getStackTrace()) {
                String cls = frame.getClassName();
                if (!"handleMessage".equals(frame.getMethodName()) || cls.startsWith("android.") || cls.startsWith("java.")) continue;
                Class<?> c = find(cls);
                if (c == null) continue;
                synchronized (Exo.class) {
                    if (internalClass != null) return;
                    internalClass = c;
                }
                Method handle = method(c, "handleMessage", android.os.Message.class);
                if (handle == null) { info = "playback handler " + cls + " has no handleMessage(Message)"; return; }
                hook("ExoPlayer handler " + cls + ".handleMessage", handle, new XC_MethodHook() {
                    @Override protected void beforeHookedMethod(MethodHookParam param) {
                        try {
                            Object msg = param.args != null && param.args.length > 0 ? param.args[0] : null;
                            if (msg instanceof android.os.Message) {
                                android.os.Message m = (android.os.Message) msg;
                                if (m.getTarget() != null) synchronized (handlers) { handlers.put(param.thisObject, m.getTarget()); }
                                if (m.what == 3 && m.obj != null && seekPositionClass == null) seekPositionClass = m.obj.getClass();
                                if (m.what == 2) synchronized (lastWork) { lastWork.put(param.thisObject, SystemClock.elapsedRealtime()); }
                            }
                        } catch (Throwable ignored) {}
                    }
                });
                info = "playback handler " + cls;
                return;
            }
        }

        /** The busiest player handler: the one that did work last (within a few seconds if possible). */
        static Object activeInternal() {
            Object best = null;
            long bestAt = -1;
            synchronized (lastWork) {
                for (Map.Entry<Object, Long> e : lastWork.entrySet()) {
                    if (e.getKey() != null && e.getValue() > bestAt) { best = e.getKey(); bestAt = e.getValue(); }
                }
            }
            return best;
        }

        static Method seekMethodOf(Class<?> cls) {
            for (Class<?> c = cls; c != null && c != Object.class; c = c.getSuperclass()) {
                String n = c.getName();
                if (n.startsWith("java.") || n.startsWith("android.")) break;
                Method[] methods;
                try { methods = c.getDeclaredMethods(); } catch (Throwable error) { continue; }
                for (Method m : methods) {
                    Class<?>[] t = m.getParameterTypes();
                    if (t.length == 4 && t[0] == int.class && t[1] == long.class && t[2] == int.class && t[3] == boolean.class
                        && m.getReturnType() == void.class && !java.lang.reflect.Modifier.isAbstract(m.getModifiers())
                        && !java.lang.reflect.Modifier.isStatic(m.getModifiers())) {
                        m.setAccessible(true);
                        return m;
                    }
                }
            }
            return null;
        }

        /** From the playback handler to the player: its fields, a few levels deep, for something with that seekTo. */
        static Object[] findPlayer(Object internal) {
            synchronized (players) {
                Object[] cached = players.get(internal);
                if (cached != null) return cached;
            }
            IdentityHashMap<Object, Boolean> seen = new IdentityHashMap<Object, Boolean>();
            java.util.ArrayDeque<Object[]> queue = new java.util.ArrayDeque<Object[]>();
            queue.add(new Object[] {internal, 0});
            while (!queue.isEmpty() && seen.size() < 1500) {
                Object[] item = queue.poll();
                Object o = item[0];
                int depth = (Integer) item[1];
                if (o == null || seen.containsKey(o) || Media.skip(o)) continue;
                seen.put(o, Boolean.TRUE);
                if (o != internal) {
                    Method s = seekMethodOf(o.getClass());
                    if (s != null) {
                        Object[] found = {o, s};
                        synchronized (players) { players.put(internal, found); }
                        return found;
                    }
                }
                if (depth >= 3 || o.getClass().isArray()) continue;
                for (Class<?> c = o.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
                    String n = c.getName();
                    if (n.startsWith("java.") || n.startsWith("android.")) break;
                    Field[] fields;
                    try { fields = c.getDeclaredFields(); } catch (Throwable error) { continue; }
                    for (Field f : fields) {
                        if (f.getType().isPrimitive() || java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
                        try { f.setAccessible(true); queue.add(new Object[] {f.get(o), depth + 1}); } catch (Throwable ignored) {}
                    }
                }
            }
            return null;
        }

        /** "<folder>/<file>" of a URL: enough to recognise it inside a player whatever its query string. */
        static String tailOf(String url) {
            if (url == null || url.isEmpty()) return "";
            int q = url.indexOf('?');
            String bare = q >= 0 ? url.substring(0, q) : url;
            String[] parts = bare.split("/");
            return parts.length >= 2 ? parts[parts.length - 2] + "/" + parts[parts.length - 1] : bare;
        }

        /** Does this player hold that file (its media item's address, somewhere in its fields)? */
        static boolean plays(Object player, String tail) {
            if (tail.isEmpty()) return false;
            IdentityHashMap<Object, Boolean> seen = new IdentityHashMap<Object, Boolean>();
            java.util.ArrayDeque<Object[]> queue = new java.util.ArrayDeque<Object[]>();
            queue.add(new Object[] {player, 0});
            while (!queue.isEmpty() && seen.size() < 5000) {
                Object[] item = queue.poll();
                Object o = item[0];
                int depth = (Integer) item[1];
                if (o == null || seen.containsKey(o)) continue;
                seen.put(o, Boolean.TRUE);
                if (o instanceof String || o instanceof Uri) {
                    if (o.toString().contains(tail)) return true;
                    continue;
                }
                if (depth >= 8 || Media.skip(o)) continue;
                if (o instanceof Collection) {
                    int i = 0;
                    try { for (Object v : (Collection<?>) o) { if (i++ > 50) break; queue.add(new Object[] {v, depth + 1}); } } catch (Throwable ignored) {}
                    continue;
                }
                if (o instanceof Map) {
                    int i = 0;
                    try { for (Object v : ((Map<?, ?>) o).values()) { if (i++ > 50) break; queue.add(new Object[] {v, depth + 1}); } } catch (Throwable ignored) {}
                    continue;
                }
                if (o instanceof Object[]) {
                    Object[] array = (Object[]) o;
                    for (int i = 0; i < array.length && i < 50; i++) queue.add(new Object[] {array[i], depth + 1});
                    continue;
                }
                if (o.getClass().isArray()) continue;
                for (Class<?> c = o.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
                    String n = c.getName();
                    if (n.startsWith("java.") || n.startsWith("android.") || n.startsWith("kotlin.")) break;
                    Field[] fields;
                    try { fields = c.getDeclaredFields(); } catch (Throwable error) { continue; }
                    for (Field f : fields) {
                        if (f.getType().isPrimitive() || java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
                        try { f.setAccessible(true); queue.add(new Object[] {f.get(o), depth + 1}); } catch (Throwable ignored) {}
                    }
                }
            }
            return false;
        }

        /** The playback handler for the file Discord's chat player plays now; else the one that worked last. */
        static Object pickInternal() {
            List<Object> all = new ArrayList<Object>();
            synchronized (lastWork) { for (Object k : lastWork.keySet()) if (k != null) all.add(k); }
            String tail = tailOf(Media.sourceUrl);
            for (Object internal : all) {
                if (plays(internal, tail)) {
                    pickedHow = "the one playing " + tail + " (of " + all.size() + ")";
                    return internal;
                }
            }
            pickedHow = (tail.isEmpty() ? "no current file known" : "none holds " + tail) + ", the busiest of " + all.size();
            return activeInternal();
        }
        static volatile String pickedHow = "";
        static final java.util.WeakHashMap<Object, Handler> handlers = new java.util.WeakHashMap<Object, Handler>();
        /** The class of ExoPlayer's seek message (message 3), when Discord has sent one itself. */
        static volatile Class<?> seekPositionClass;

        /**
         * ExoPlayer's seek message is message 3 with a small "seek position" object: (timeline, item index, position in
         * microseconds). Its class is found by shape among the handler's own field and parameter types: a class with exactly a
         * constructor (T, int, long) and three fields of those types, T being an abstract class (the timeline).
         */
        static java.lang.reflect.Constructor<?> seekPositionMaker(Class<?> internal) {
            List<Class<?>> types = new ArrayList<Class<?>>();
            Class<?> known = seekPositionClass;
            if (known != null) types.add(known);
            try { for (Field f : internal.getDeclaredFields()) types.add(f.getType()); } catch (Throwable ignored) {}
            try { for (Method m : internal.getDeclaredMethods()) for (Class<?> t : m.getParameterTypes()) types.add(t); } catch (Throwable ignored) {}
            for (Class<?> type : types) {
                if (type.isPrimitive() || type.isArray() || type.getName().startsWith("java.") || type.getName().startsWith("android.")) continue;
                java.lang.reflect.Constructor<?>[] makers;
                try { makers = type.getDeclaredConstructors(); } catch (Throwable error) { continue; }
                for (java.lang.reflect.Constructor<?> maker : makers) {
                    Class<?>[] t = maker.getParameterTypes();
                    if (t.length != 3 || t[1] != int.class || t[2] != long.class || t[0].isPrimitive() || t[0].getName().startsWith("java.")) continue;
                    if (!java.lang.reflect.Modifier.isAbstract(t[0].getModifiers())) continue;
                    int timelines = 0, ints = 0, longs = 0, others = 0;
                    for (Field f : type.getDeclaredFields()) {
                        if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
                        if (f.getType() == t[0]) timelines++;
                        else if (f.getType() == int.class) ints++;
                        else if (f.getType() == long.class) longs++;
                        else others++;
                    }
                    if (timelines == 1 && ints == 1 && longs == 1 && others == 0) {
                        maker.setAccessible(true);
                        return maker;
                    }
                }
            }
            return null;
        }

        static boolean messageSeek(Object internal, long ms) {
            Handler handler;
            synchronized (handlers) { handler = handlers.get(internal); }
            if (handler == null) { info = "no handler seen for the player yet"; return false; }
            java.lang.reflect.Constructor<?> maker = seekPositionMaker(internal.getClass());
            if (maker == null) { info = "seek message shape not found on " + internal.getClass().getName(); return false; }
            Object timeline = instanceOf(internal, maker.getParameterTypes()[0]);
            if (timeline == null) { info = "no timeline found for " + maker.getDeclaringClass().getName(); return false; }
            try {
                Object position = maker.newInstance(timeline, 0, ms * 1000L);
                android.os.Message.obtain(handler, 3, position).sendToTarget();
                info = "seek message " + maker.getDeclaringClass().getName() + " to " + internal.getClass().getName() + " (" + pickedHow + ")";
                diag.count("seek through ExoPlayer (message)");
                return true;
            } catch (Throwable error) {
                info = "seek message: " + error;
                return false;
            }
        }

        /**
         * The playback handler's own seek: seekTo(Timeline, int item, long positionUs). It only queues a message on the playback
         * thread, so it is safe from any thread. Found by shape: void (object, int, long); the timeline is the one it holds.
         */
        static Object[] internalSeek(Object internal) {
            Method found = null;
            for (Class<?> c = internal.getClass(); c != null && c != Object.class && found == null; c = c.getSuperclass()) {
                Method[] methods;
                try { methods = c.getDeclaredMethods(); } catch (Throwable error) { continue; }
                for (Method m : methods) {
                    Class<?>[] t = m.getParameterTypes();
                    if (t.length == 3 && !t[0].isPrimitive() && !t[0].getName().startsWith("java.") && !t[0].getName().startsWith("android.")
                        && t[1] == int.class && t[2] == long.class && m.getReturnType() == void.class
                        && !java.lang.reflect.Modifier.isStatic(m.getModifiers()) && !java.lang.reflect.Modifier.isAbstract(m.getModifiers())) {
                        m.setAccessible(true);
                        found = m;
                        break;
                    }
                }
            }
            if (found == null) return null;
            Object timeline = instanceOf(internal, found.getParameterTypes()[0]);
            return timeline == null ? new Object[] {found, null} : new Object[] {found, timeline};
        }

        /** The first object of that type in its fields (a few levels deep). */
        static Object instanceOf(Object root, Class<?> type) {
            IdentityHashMap<Object, Boolean> seen = new IdentityHashMap<Object, Boolean>();
            java.util.ArrayDeque<Object[]> queue = new java.util.ArrayDeque<Object[]>();
            queue.add(new Object[] {root, 0});
            while (!queue.isEmpty() && seen.size() < 2000) {
                Object[] item = queue.poll();
                Object o = item[0];
                int depth = (Integer) item[1];
                if (o == null || seen.containsKey(o)) continue;
                seen.put(o, Boolean.TRUE);
                if (o != root && type.isInstance(o)) return o;
                if (depth >= 3 || Media.skip(o) || o.getClass().isArray()) continue;
                for (Class<?> c = o.getClass(); c != null && c != Object.class; c = c.getSuperclass()) {
                    String n = c.getName();
                    if (n.startsWith("java.") || n.startsWith("android.") || n.startsWith("kotlin.")) break;
                    Field[] fields;
                    try { fields = c.getDeclaredFields(); } catch (Throwable error) { continue; }
                    for (Field f : fields) {
                        if (f.getType().isPrimitive() || java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
                        try { f.setAccessible(true); queue.add(new Object[] {f.get(o), depth + 1}); } catch (Throwable ignored) {}
                    }
                }
            }
            return null;
        }

        /** Methods of the handler that take a long: what there is to work with, for the report. */
        static String longMethods(Object internal) {
            List<String> out = new ArrayList<String>();
            try {
                for (Method m : internal.getClass().getDeclaredMethods()) {
                    StringBuilder sig = new StringBuilder(m.getName()).append('(');
                    boolean hasLong = false;
                    Class<?>[] t = m.getParameterTypes();
                    for (int i = 0; i < t.length; i++) { sig.append(i > 0 ? "," : "").append(t[i].getSimpleName()); if (t[i] == long.class) hasLong = true; }
                    if (hasLong && out.size() < 12) out.add(sig.append(')').toString());
                }
            } catch (Throwable ignored) {}
            return out.toString();
        }

        /** Seeks Discord's chat player. False when it cannot be done here (the JavaScript half then tries). */
        static boolean seek(final long ms) {
            if (lastWork.isEmpty()) { info = internalClass == null ? info : "no player has played yet"; return false; }
            final Object internal;
            try { internal = pickInternal(); } catch (Throwable error) { info = "picking the player: " + error; return false; }
            if (internal == null) { info = "no player"; return false; }
            Object[] way = null;
            try { way = internalSeek(internal); } catch (Throwable error) { info = "handler seek: " + error; }
            if (way != null && way[1] != null) {
                final Method m = (Method) way[0];
                final Object timeline = way[1];
                try {
                    m.invoke(internal, timeline, 0, ms * 1000L);
                    info = "seek through " + internal.getClass().getName() + "." + m.getName() + " (" + pickedHow + ")";
                    diag.count("seek through ExoPlayer");
                    return true;
                } catch (Throwable error) {
                    diag.error("ExoPlayer seek", error instanceof java.lang.reflect.InvocationTargetException && error.getCause() != null ? error.getCause() : error);
                }
            }
            // ExoPlayer's own seek message.
            try { if (messageSeek(internal, ms)) return true; } catch (Throwable error) { info = "seek message: " + error; }
            final String messageInfo = info;
            // The player object, if it can be reached from the handler: seekTo(int item, long ms, int command, boolean).
            final Object[] found;
            try { found = findPlayer(internal); } catch (Throwable error) { info = "looking for the player: " + error; return false; }
            if (found == null) {
                info = messageInfo + "; no seek found on " + internal.getClass().getName() + (way == null ? "" : way[1] == null ? " (seek found, no timeline)" : "") + "; methods with a long: " + longMethods(internal);
                return false;
            }
            final Method seek = (Method) found[1];
            info = "player " + found[0].getClass().getName() + "." + seek.getName() + "(int,long,int,boolean) (" + pickedHow + ")";
            post(new Runnable() {
                public void run() {
                    try {
                        // Item 0 (Discord's chat player plays one file), command 5 = seek in the current item.
                        seek.invoke(found[0], 0, ms, 5, false);
                        diag.count("seek through ExoPlayer");
                    } catch (Throwable error) {
                        diag.error("ExoPlayer seek", error instanceof java.lang.reflect.InvocationTargetException && error.getCause() != null ? error.getCause() : error);
                    }
                }
            });
            return true;
        }
    }

    // =========================================================================================================
    // Hooks
    // =========================================================================================================
    static void hook(String name, Member member, XC_MethodHook callback) {
        if (member == null) { diag.note("hook " + name + ": not found"); return; }
        try {
            XC_MethodHook.Unhook unhook = XposedBridge.hookMethod(member, callback);
            if (unhook != null) synchronized (unhooks) { unhooks.add(unhook); }
            diag.hooks.add(name);
        } catch (Throwable error) {
            diag.error("hook " + name, error);
        }
    }

    static Method method(Class<?> cls, String name, Class<?>... types) {
        if (cls == null) return null;
        for (Class<?> c = cls; c != null; c = c.getSuperclass()) {
            try {
                Method m = c.getDeclaredMethod(name, types);
                m.setAccessible(true);
                return m;
            } catch (NoSuchMethodException ignored) {
            } catch (Throwable error) {
                return null;
            }
        }
        return null;
    }

    static Class<?> find(String name) {
        ClassLoader[] loaders = {hostLoader, app != null ? app.getClassLoader() : null, BetterMedias.class.getClassLoader()};
        for (ClassLoader loader : loaders) {
            if (loader == null) continue;
            try { return Class.forName(name, false, loader); } catch (Throwable ignored) {}
        }
        return null;
    }

    /** What kind of player a lifecycle listener is, from its class name; null for anything that is not a player. */
    static String kind(String className) {
        String n = className.toLowerCase();
        if (n.contains("engine") || n.contains("rtc") || n.contains("call") || n.contains("camera") || n.contains("stream") || n.contains("record")) return null;
        if (n.contains("video") || n.contains("exo")) return "video";
        if (n.contains("voice")) return "voice";
        if (n.contains("audio") || n.contains("player") || n.contains("media") || n.contains("sound")) return "audio";
        return null;
    }

    static boolean keepsPlaying(String kind) {
        if ("chat player".equals(kind)) return bgVideo || bgAudio || bgVoice;
        return ("video".equals(kind) && bgVideo) || ("audio".equals(kind) && bgAudio) || ("voice".equals(kind) && bgVoice);
    }

    /** Listeners taken out of React Native's "app went to the background" call, put back right after it. */
    static final List<Object> heldOut = new ArrayList<Object>();

    @SuppressWarnings("unchecked")
    static void installHooks() {
        // --- Players that would pause when Discord goes to the background are left out of that call.
        Class<?> reactContext = find("com.facebook.react.bridge.ReactContext");
        final Field listenersField = field(reactContext, "mLifecycleEventListeners");
        if (reactContext != null && listenersField == null) diag.note("ReactContext has no mLifecycleEventListeners");
        hook("ReactContext.onHostPause", method(reactContext, "onHostPause"), new XC_MethodHook() {
            @Override protected void beforeHookedMethod(MethodHookParam param) {
                try {
                    foreground = false;
                    diag.lastPauseAt = SystemClock.elapsedRealtime();
                    if (listenersField == null) return;
                    Object set = listenersField.get(param.thisObject);
                    if (!(set instanceof Collection)) return;
                    Collection<Object> all = (Collection<Object>) set;
                    synchronized (heldOut) {
                        heldOut.clear();
                        Media.find(param.thisObject);
                        for (Object listener : all) {
                            String name = listener.getClass().getName();
                            String kind = Media.isMediaListener(listener) ? "chat player" : kind(name);
                            diag.listeners.add(name + (kind == null ? "" : " [" + kind + "]"));
                            if (kind != null && keepsPlaying(kind)) heldOut.add(listener);
                        }
                        for (Object listener : heldOut) all.remove(listener);
                        if (!heldOut.isEmpty()) diag.count("kept playing on leave");
                    }
                } catch (Throwable error) {
                    diag.error("onHostPause before", error);
                }
            }

            @Override protected void afterHookedMethod(MethodHookParam param) {
                try {
                    if (listenersField == null) return;
                    Object set = listenersField.get(param.thisObject);
                    synchronized (heldOut) {
                        if (set instanceof Collection) ((Collection<Object>) set).addAll(heldOut);
                        heldOut.clear();
                    }
                } catch (Throwable error) {
                    diag.error("onHostPause after", error);
                }
                MiniView m = mini;
                if (m != null && !bgVideo) post(new Runnable() { public void run() { MiniView n = mini; if (n != null) n.command("pause", -1); } });
            }
        });
        hook("ReactContext.onHostResume", method(reactContext, "onHostResume", Activity.class), new XC_MethodHook() {
            @Override protected void afterHookedMethod(MethodHookParam param) {
                foreground = true;
                try { Media.find(param.thisObject); } catch (Throwable error) { diag.error("find chat player", error); }
            }
        });

        // --- Track Discord's window (for the mini player and Picture-in-Picture).
        hook("Activity.onResume", method(Activity.class, "onResume"), new XC_MethodHook() {
            @Override protected void afterHookedMethod(MethodHookParam param) {
                try {
                    if (!(param.thisObject instanceof Activity)) return;
                    Activity a = (Activity) param.thisObject;
                    if (app != null && !a.getPackageName().equals(app.getPackageName())) return;
                    activityRef = new WeakReference<Activity>(a);
                    foreground = true;
                    hookActivityClass(a.getClass());
                    MiniView m = mini;
                    if (m != null) m.attachTo(a);
                    pip.apply();
                } catch (Throwable error) {
                    diag.error("onResume", error);
                }
            }
        });
        hook("Activity.onUserLeaveHint", method(Activity.class, "onUserLeaveHint"), new XC_MethodHook() {
            @Override protected void afterHookedMethod(MethodHookParam param) {
                if (!(param.thisObject instanceof Activity)) return;
                try { Media.handOffForPip((Activity) param.thisObject); } catch (Throwable error) { diag.error("pip hand-off", error); }
                pip.onUserLeaveHint((Activity) param.thisObject);
            }
        });

        // --- Players side by side: while Discord is open, a media player asking for the audio is told yes without taking it
        // from the others (that would pause them). Calls and anything that is not media are left alone.
        if (Build.VERSION.SDK_INT >= 26) {
            hook("AudioManager.requestAudioFocus(request)", method(AudioManager.class, "requestAudioFocus", AudioFocusRequest.class), new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam param) {
                    try {
                        if (!together || !foreground || param.args == null || param.args.length < 1) return;
                        AudioFocusRequest request = (AudioFocusRequest) param.args[0];
                        AudioAttributes attributes = request.getAudioAttributes();
                        int usage = attributes == null ? AudioAttributes.USAGE_MEDIA : attributes.getUsage();
                        if (usage != AudioAttributes.USAGE_MEDIA && usage != AudioAttributes.USAGE_UNKNOWN && usage != AudioAttributes.USAGE_GAME) return;
                        param.setResult(AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
                        diag.count("audio focus shared");
                    } catch (Throwable error) {
                        diag.error("audio focus", error);
                    }
                }
            });
        }
        hook("AudioManager.requestAudioFocus(listener)", method(AudioManager.class, "requestAudioFocus", AudioManager.OnAudioFocusChangeListener.class, int.class, int.class), new XC_MethodHook() {
            @Override protected void beforeHookedMethod(MethodHookParam param) {
                try {
                    if (!together || !foreground || param.args == null || param.args.length < 2) return;
                    Object stream = param.args[1];
                    if (!(stream instanceof Integer) || (Integer) stream != AudioManager.STREAM_MUSIC) return;
                    param.setResult(AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
                    diag.count("audio focus shared");
                } catch (Throwable error) {
                    diag.error("audio focus (old)", error);
                }
            }
        });

        // --- Report: who pauses a player (the stack of the first few pauses).
        hook("AudioTrack.pause", method(AudioTrack.class, "pause"), new XC_MethodHook() {
            @Override protected void beforeHookedMethod(MethodHookParam param) {
                try { Exo.discover(); } catch (Throwable ignored) {}
                diag.pausedBy("AudioTrack");
            }
        });
        hook("AudioTrack.play", method(AudioTrack.class, "play"), new XC_MethodHook() {
            @Override protected void beforeHookedMethod(MethodHookParam param) {
                if (Exo.internalClass == null) try { Exo.discover(); } catch (Throwable ignored) {}
            }
        });
        hook("MediaPlayer.pause", method(MediaPlayer.class, "pause"), new XC_MethodHook() {
            @Override protected void beforeHookedMethod(MethodHookParam param) {
                MiniView m = mini;
                if (m != null && param.thisObject == m.player) return;
                diag.pausedBy("MediaPlayer");
            }
        });
    }

    /**
     * Discord's own activity replaces onUserLeaveHint (it starts Picture-in-Picture for calls there) without calling Android's,
     * so the hook on Activity never runs: its own methods are hooked too. onPictureInPictureModeChanged catches the moment the
     * window becomes Picture-in-Picture, whichever way that happened.
     */
    static final Set<Class<?>> hookedActivities = new LinkedHashSet<Class<?>>();

    static void hookActivityClass(Class<?> cls) {
        synchronized (hookedActivities) { if (!hookedActivities.add(cls)) return; }
        for (Class<?> c = cls; c != null && c != Activity.class && c != Object.class; c = c.getSuperclass()) {
            Method[] methods;
            try { methods = c.getDeclaredMethods(); } catch (Throwable error) { continue; }
            for (Method m : methods) {
                String name = m.getName();
                Class<?>[] types = m.getParameterTypes();
                if (java.lang.reflect.Modifier.isAbstract(m.getModifiers())) continue;
                if (name.equals("onUserLeaveHint") && types.length == 0) {
                    hook(c.getSimpleName() + ".onUserLeaveHint", m, new XC_MethodHook() {
                        @Override protected void beforeHookedMethod(MethodHookParam param) {
                            if (!(param.thisObject instanceof Activity)) return;
                            try { Media.handOffForPip((Activity) param.thisObject); } catch (Throwable error) { diag.error("pip hand-off", error); }
                        }
                    });
                } else if (name.equals("onPictureInPictureModeChanged") && types.length >= 1 && types[0] == boolean.class) {
                    hook(c.getSimpleName() + ".onPictureInPictureModeChanged(" + types.length + ")", m, new XC_MethodHook() {
                        @Override protected void afterHookedMethod(MethodHookParam param) {
                            try {
                                boolean inPip = param.args != null && param.args.length > 0 && Boolean.TRUE.equals(param.args[0]);
                                if (inPip && param.thisObject instanceof Activity) {
                                    diag.count("entered Picture-in-Picture");
                                    Media.handOffForPip((Activity) param.thisObject);
                                }
                                post(new Runnable() { public void run() { MiniView v = mini; if (v != null) { v.layoutMini(); v.fitVideo(); v.fitPip(); } } });
                            } catch (Throwable error) {
                                diag.error("pip changed", error);
                            }
                        }
                    });
                }
            }
        }
    }

    static Field field(Class<?> cls, String name) {
        for (Class<?> c = cls; c != null; c = c.getSuperclass()) {
            try {
                Field f = c.getDeclaredField(name);
                f.setAccessible(true);
                return f;
            } catch (NoSuchFieldException ignored) {
            } catch (Throwable error) {
                return null;
            }
        }
        return null;
    }

    // =========================================================================================================
    // Bridge
    // =========================================================================================================
    static String str(List<?> args, int i) {
        Object v = args != null && args.size() > i ? args.get(i) : null;
        return v == null ? "" : String.valueOf(v);
    }

    static long num(List<?> args, int i, long fallback) {
        Object v = args != null && args.size() > i ? args.get(i) : null;
        return v instanceof Number ? ((Number) v).longValue() : fallback;
    }

    static boolean bool(List<?> args, int i, boolean fallback) {
        Object v = args != null && args.size() > i ? args.get(i) : null;
        return v instanceof Boolean ? (Boolean) v : fallback;
    }

    static void register(ValencedBridge bridge, String name, Function1<List<?>, Object> handler) {
        bridge.registerMethod(PREFIX + name, handler);
    }

    static void applyConfig(String json) {
        try {
            JSONObject o = new JSONObject(json);
            bgVideo = o.optBoolean("backgroundVideo", bgVideo);
            bgAudio = o.optBoolean("backgroundAudio", bgAudio);
            bgVoice = o.optBoolean("backgroundVoice", bgVoice);
            pipOn = o.optBoolean("pictureInPicture", pipOn);
            crossChat = o.optBoolean("crossChat", crossChat);
            together = o.optBoolean("simultaneous", together);
            notifyOn = o.optBoolean("notification", notifyOn);
            if (!notifyOn) post(new Runnable() { public void run() { Session s = session; if (s != null) s.hide(); } });
            post(new Runnable() { public void run() { pip.apply(); } });
        } catch (Throwable error) {
            diag.error("config", error);
        }
    }

    static void start(final PluginScope ctx) {
        // A copy left by an earlier load of this plugin (a reinstall) is shut down first.
        Properties properties = System.getProperties();
        Object old = properties.get(REGISTRY_KEY);
        if (old instanceof Runnable) { try { ((Runnable) old).run(); } catch (Throwable ignored) {} }
        properties.put(REGISTRY_KEY, new Runnable() { public void run() { stop(); } });
        running = true;
        actions = new Actions();
        try { hostLoader = ctx.getClassLoader(); } catch (Throwable ignored) {}
        ctx.withAppContext(new Function1<Context, Unit>() {
            public Unit invoke(Context context) {
                app = context.getApplicationContext() != null ? context.getApplicationContext() : context;
                return Unit.INSTANCE;
            }
        });
        ctx.withAppActivity(new Function1<Activity, Unit>() {
            public Unit invoke(Activity activity) {
                activityRef = new WeakReference<Activity>(activity);
                if (app == null) app = activity.getApplicationContext();
                return Unit.INSTANCE;
            }
        });
        try { installHooks(); } catch (Throwable error) { diag.error("hooks", error); }

        ValencedBridge bridge = ctx.getBridge();
        register(bridge, "config", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) { applyConfig(str(args, 0)); return Boolean.TRUE; }
        });
        register(bridge, "update", new Function1<List<?>, Object>() {
            public Object invoke(final List<?> args) {
                post(new Runnable() {
                    public void run() {
                        try {
                            JSONObject o = new JSONObject(str(args, 0));
                            Session s = session();
                            if (s != null) s.update(o.optString("target"), o.optString("title"), o.optString("subtitle"), o.optLong("durationMs", -1),
                                o.optLong("positionMs", 0), o.optBoolean("playing"), o.optBoolean("canSeek"));
                        } catch (Throwable error) {
                            diag.error("update", error);
                        }
                    }
                });
                return Boolean.TRUE;
            }
        });
        register(bridge, "clear", new Function1<List<?>, Object>() {
            public Object invoke(final List<?> args) {
                post(new Runnable() { public void run() { Session s = session; if (s != null) s.clear(str(args, 0)); } });
                return Boolean.TRUE;
            }
        });
        register(bridge, "miniOpen", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) {
                if (!crossChat) return Boolean.FALSE;
                openMini(str(args, 0), num(args, 1, 0), str(args, 2), bool(args, 3, true));
                return Boolean.TRUE;
            }
        });
        register(bridge, "mini", new Function1<List<?>, Object>() {
            public Object invoke(final List<?> args) {
                post(new Runnable() {
                    public void run() {
                        String cmd = str(args, 0);
                        if ("close".equals(cmd)) closeMini();
                        else { MiniView m = mini; if (m != null) m.command(cmd, num(args, 1, -1)); }
                    }
                });
                return mini != null;
            }
        });
        register(bridge, "miniState", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) {
                MiniView m = mini;
                return m == null ? "closed" : m.isPlaying() ? "playing" : "paused";
            }
        });
        register(bridge, "pip", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) {
                inCall = bool(args, 3, inCall);
                pip.set(str(args, 4).isEmpty() ? "js" : str(args, 4), bool(args, 0, false), (int) num(args, 1, 16), (int) num(args, 2, 9));
                return Boolean.TRUE;
            }
        });
        register(bridge, "nativeSource", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) { Media.sourceUrl = str(args, 0); return Boolean.TRUE; }
        });
        register(bridge, "nativeVideo", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) {
                String url = str(args, 0);
                if (!url.isEmpty() && !url.equals(Media.videoUrl)) Media.probeSize(url);
                Media.videoUrl = url;
                Media.videoPosMs = num(args, 1, 0);
                Media.videoTitle = str(args, 2);
                Media.videoPlaying = bool(args, 3, false) && !Media.videoUrl.isEmpty();
                Media.videoAt = SystemClock.elapsedRealtime();
                if (Media.videoPlaying) Media.videoPlayedAt = Media.videoAt;
                return Boolean.TRUE;
            }
        });
        register(bridge, "status", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) {
                try {
                    JSONObject o = new JSONObject();
                    o.put("version", VERSION);
                    o.put("sdk", Build.VERSION.SDK_INT);
                    o.put("pip", Pip.supportText(activity()));
                    o.put("hooks", diag.hooks.size());
                    return o.toString();
                } catch (Throwable error) {
                    return "{}";
                }
            }
        });
        register(bridge, "report", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) { return diag.text(); }
        });
        bridge.registerAsyncMethod(PREFIX + "nextAction", new Function2<List<?>, Continuation<?>, Object>() {
            public Object invoke(List<?> args, Continuation<?> continuation) {
                Actions queue = actions;
                return queue == null ? "stop" : queue.next(continuation);
            }
        });
    }

    static void stop() {
        if (!running) return;
        running = false;
        synchronized (unhooks) {
            for (XC_MethodHook.Unhook unhook : unhooks) { try { unhook.unhook(); } catch (Throwable ignored) {} }
            unhooks.clear();
        }
        diag.hooks.clear();
        Actions queue = actions;
        actions = null;
        if (queue != null) queue.send("stop");
        post(new Runnable() {
            public void run() {
                closeMini();
                pip.set("js", false, 16, 9);
                pip.set(MINI, false, 16, 9);
                pip.apply();
                Session s = session;
                session = null;
                if (s != null) s.release();
            }
        });
        System.getProperties().remove(REGISTRY_KEY);
    }

    public static PluginBuilder getBetterMedias() {
        PluginBuilder builder = new PluginBuilder();
        builder.start(new Function1<PluginScope, Unit>() {
            public Unit invoke(PluginScope ctx) { start(ctx); return Unit.INSTANCE; }
        });
        builder.stop(new Function1<PluginScope, Unit>() {
            public Unit invoke(PluginScope ctx) { stop(); return Unit.INSTANCE; }
        });
        return builder;
    }
}
