/* SPDX-License-Identifier: GPL-3.0-or-later
 * Mute & Deafen Bubble for Valenced: the native half.
 * Based on Mute Bubble 3.3.3 by coder.gg (https://github.com/il1ll/ValencedPlugins, GPL-3.0), rewritten in Java
 * with deafen, screen share and disconnect buttons. MarkLong0467.
 *
 * A floating bubble over other apps while you are in a call and Discord is in the background. It has the buttons
 * chosen in the settings, top to bottom: mute, deafen, screen share, disconnect. Taps are handed to the JS half
 * (nextAction), which asks Discord to do it.
 */
package marklong.voicebubble;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;

import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.List;
import java.util.Properties;
import java.util.Set;

import app.valenced.bridge.ValencedBridge;
import app.valenced.plugins.PluginBuilder;
import app.valenced.plugins.PluginScope;
import kotlin.Unit;
import kotlin.jvm.functions.Function1;

public final class VoiceBubble {
    private static final String PREFIX = "marklong.voicebubble.";
    private static final int BUTTON_DP = 52;
    private static final int GAP_DP = 8;
    private static final int PAD_DP = 4;
    private static final long POLL_MS = 3000L;
    private static final String REGISTRY_KEY = "marklong.voicebubble.active";

    /**
     * The last error the native half caught, for the settings page. Nothing here may throw into Android: an exception
     * on the main thread (a posted Runnable, a draw, a touch, an activity callback) closes the whole app.
     */
    static volatile String lastError = "";

    static void note(String where, Throwable error) {
        try {
            StringBuilder text = new StringBuilder(where).append(": ").append(error);
            StackTraceElement[] trace = error.getStackTrace();
            for (int i = 0; i < trace.length && i < 8; i++) text.append("\n  at ").append(trace[i]);
            text.append("\nAndroid ").append(Build.VERSION.RELEASE).append(" (SDK ").append(Build.VERSION.SDK_INT).append("), ")
                .append(Build.MANUFACTURER).append(' ').append(Build.MODEL);
            lastError = text.toString();
            android.util.Log.e("VoiceBubble", where, error);
        } catch (Throwable ignored) {}
    }

    /** A Runnable that can never throw. */
    static Runnable safe(final String where, final Runnable body) {
        return new Runnable() {
            public void run() {
                try { body.run(); } catch (Throwable error) { note(where, error); }
            }
        };
    }

    static final int MUTE = 0;
    static final int DEAF = 1;
    static final int SHARE = 2;
    static final int LEAVE = 3;

    static final int[] DEFAULT_BUTTONS = {MUTE, DEAF};

    /**
     * Which buttons the bubble has, top to bottom, from the settings: a list such as "mute,deafen,screenshare,
     * disconnect" (0.3), or 0.2's "both", "mute" or "deafen".
     */
    static int[] buttonsFrom(Object value) {
        if (!(value instanceof String)) return DEFAULT_BUTTONS;
        String text = (String) value;
        if ("both".equals(text)) return DEFAULT_BUTTONS;
        boolean[] has = new boolean[4];
        int count = 0;
        for (String part : text.split(",")) {
            int which = "mute".equals(part) ? MUTE : "deafen".equals(part) ? DEAF
                : "screenshare".equals(part) ? SHARE : "disconnect".equals(part) ? LEAVE : -1;
            if (which >= 0 && !has[which]) { has[which] = true; count++; }
        }
        if (count == 0) return DEFAULT_BUTTONS;
        int[] result = new int[count];
        int i = 0;
        for (int which = 0; which < has.length; which++) if (has[which]) result[i++] = which;
        return result;
    }

    // ---------------------------------------------------------------------------------------------------------------
    // The bubble: a dark pill with a column of round buttons. Mute and deafen are red while on, screen share is blue
    // while sharing, and disconnect is always red.
    // ---------------------------------------------------------------------------------------------------------------
    static final class BubbleView extends View {
        boolean muted, deafened, sharing;
        int[] buttons = DEFAULT_BUTTONS;
        int pressed = -1;
        private final float density;
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);

        BubbleView(Context context) {
            super(context);
            density = context.getResources().getDisplayMetrics().density;
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeCap(Paint.Cap.ROUND);
            ring.setStyle(Paint.Style.STROKE);
            ring.setStrokeWidth(1.5f * density);
            ring.setColor(0x33FFFFFF);
            setContentDescription("Voice buttons");
        }

        void set(boolean muted, boolean deafened, boolean sharing) {
            this.muted = muted;
            this.deafened = deafened;
            this.sharing = sharing;
            invalidate();
        }

        float button() { return BUTTON_DP * density; }
        float pad() { return PAD_DP * density; }
        float gap() { return GAP_DP * density; }

        /** Which button a point inside the view is on (each button owns its slot and half of the gaps around it). */
        int buttonAt(float y) {
            float step = button() + gap();
            int index = (int) Math.floor((y - pad() + gap() / 2f) / step);
            if (index < 0) index = 0;
            if (index >= buttons.length) index = buttons.length - 1;
            return buttons[index];
        }

        @Override
        protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
            int count = Math.max(1, buttons.length);
            setMeasuredDimension((int) (button() + 2 * pad()), (int) (count * button() + (count - 1) * gap() + 2 * pad()));
        }

        @Override
        protected void onDraw(Canvas canvas) {
            try { paint(canvas); } catch (Throwable error) { note("draw", error); }
        }

        private void paint(Canvas canvas) {
            float w = getWidth(), h = getHeight(), r = w / 2f;
            fill.setColor(0xF01E1F22);
            canvas.drawRoundRect(new RectF(0, 0, w, h), r, r, fill);
            float cx = w / 2f, size = button();
            for (int i = 0; i < buttons.length; i++) {
                int which = buttons[i];
                float cy = pad() + size / 2f + i * (size + gap());
                // The mic shows muted while deafened too, as Discord does.
                boolean on = which == MUTE ? muted || deafened : which == DEAF ? deafened : which == SHARE && sharing;
                drawButton(canvas, cx, cy, size, on, pressed == which, which);
            }
        }

        private void drawButton(Canvas canvas, float cx, float cy, float size, boolean on, boolean down, int which) {
            int background;
            if (which == LEAVE) background = down ? 0xFFA12828 : 0xFFDA373C;
            else if (which == SHARE && on) background = down ? 0xFF3C45A5 : 0xFF5865F2;
            else if (on) background = down ? 0xFFA12828 : 0xFFDA373C;
            else background = down ? 0xFF404249 : 0xFF2B2D31;
            boolean filled = on || which == LEAVE;
            float radius = size / 2f - density;
            fill.setColor(background);
            canvas.drawCircle(cx, cy, radius, fill);
            if (!filled) canvas.drawCircle(cx, cy, radius, ring);

            float unit = size / 40f;
            float left = cx - 12f * unit, top = cy - 12f * unit;
            fill.setColor(0xFFFFFFFF);
            stroke.setColor(0xFFFFFFFF);
            stroke.setStrokeWidth(2f * unit);
            if (which == SHARE) {
                // A screen with an arrow going up out of it.
                canvas.drawRoundRect(new RectF(left + 2f * unit, top + 4f * unit, left + 22f * unit, top + 18f * unit), 2f * unit, 2f * unit, stroke);
                canvas.drawLine(left + 8f * unit, top + 21.5f * unit, left + 16f * unit, top + 21.5f * unit, stroke);
                canvas.drawLine(left + 12f * unit, top + 15f * unit, left + 12f * unit, top + 8f * unit, stroke);
                canvas.drawLine(left + 9f * unit, top + 11f * unit, left + 12f * unit, top + 8f * unit, stroke);
                canvas.drawLine(left + 15f * unit, top + 11f * unit, left + 12f * unit, top + 8f * unit, stroke);
                return;
            }
            if (which == LEAVE) {
                // A phone handset lying on its back: a curved earpiece-to-mouthpiece band with two feet.
                stroke.setStrokeWidth(3.5f * unit);
                canvas.drawArc(new RectF(left + 2.5f * unit, top + 8f * unit, left + 21.5f * unit, top + 22f * unit), 200f, 140f, false, stroke);
                stroke.setStrokeWidth(2f * unit);
                canvas.drawRoundRect(new RectF(left + 1.5f * unit, top + 11f * unit, left + 7.5f * unit, top + 16f * unit), 2f * unit, 2f * unit, fill);
                canvas.drawRoundRect(new RectF(left + 16.5f * unit, top + 11f * unit, left + 22.5f * unit, top + 16f * unit), 2f * unit, 2f * unit, fill);
                return;
            }
            if (which == MUTE) {
                canvas.drawRoundRect(new RectF(left + 9f * unit, top + 2f * unit, left + 15f * unit, top + 14f * unit), 3f * unit, 3f * unit, fill);
                canvas.drawArc(new RectF(left + 5.5f * unit, top + 5f * unit, left + 18.5f * unit, top + 17f * unit), 0f, 180f, false, stroke);
                canvas.drawLine(left + 12f * unit, top + 17f * unit, left + 12f * unit, top + 21f * unit, stroke);
                canvas.drawLine(left + 8.5f * unit, top + 21f * unit, left + 15.5f * unit, top + 21f * unit, stroke);
            } else {
                // Headphones: a band over the top and two ear cups.
                canvas.drawArc(new RectF(left + 3f * unit, top + 3f * unit, left + 21f * unit, top + 21f * unit), 180f, 180f, false, stroke);
                canvas.drawLine(left + 3f * unit, top + 12f * unit, left + 3f * unit, top + 16f * unit, stroke);
                canvas.drawLine(left + 21f * unit, top + 12f * unit, left + 21f * unit, top + 16f * unit, stroke);
                canvas.drawRoundRect(new RectF(left + 2f * unit, top + 13f * unit, left + 8f * unit, top + 21f * unit), 2f * unit, 2f * unit, fill);
                canvas.drawRoundRect(new RectF(left + 16f * unit, top + 13f * unit, left + 22f * unit, top + 21f * unit), 2f * unit, 2f * unit, fill);
            }
            if (on) {
                stroke.setColor(background);
                stroke.setStrokeWidth(5f * unit);
                canvas.drawLine(left + 4f * unit, top + 3f * unit, left + 20f * unit, top + 21f * unit, stroke);
                stroke.setColor(0xFFFFFFFF);
                stroke.setStrokeWidth(2f * unit);
                canvas.drawLine(left + 4f * unit, top + 3f * unit, left + 20f * unit, top + 21f * unit, stroke);
            }
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Taps waiting for the JS half, which asks for them (nextAction) several times a second during a call. A plain queue:
    // 0.3 suspended a Kotlin coroutine by hand from Java here, which is easy to get subtly wrong, so it is gone.
    // ---------------------------------------------------------------------------------------------------------------
    static final class Actions {
        private final ArrayDeque<String> queue = new ArrayDeque<String>();

        synchronized void send(String action) {
            if (queue.size() < 32) queue.add(action);
        }

        synchronized String next() {
            String ready = queue.poll();
            return ready != null ? ready : "none";
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // When the bubble shows: in a call, Discord in the background, the switch on and the overlay permission given.
    // ---------------------------------------------------------------------------------------------------------------
    static final class Controller {
        final Context context;
        final Handler handler = new Handler(Looper.getMainLooper());
        final WindowManager windowManager;
        final AudioManager audio;
        final Actions actions = new Actions();

        final Set<Activity> startedActivities = new HashSet<Activity>();
        boolean reportedInCall, muted, deafened, sharing, enabled = true, bubbleEnabled = true, attached;
        int[] buttons = DEFAULT_BUTTONS;
        /** After disconnect is tapped the bubble stays hidden until then, while Android's call audio winds down. */
        long hiddenUntil;
        BubbleView bubble;
        WindowManager.LayoutParams params;
        int savedX = -1, savedY = -1;

        final Runnable poll = new Runnable() {
            public void run() {
                try { refresh(); } catch (Throwable error) { note("poll", error); }
                if (bubble != null || startedActivities.isEmpty()) handler.postDelayed(this, POLL_MS);
            }
        };

        final Application.ActivityLifecycleCallbacks callbacks = new Application.ActivityLifecycleCallbacks() {
            public void onActivityStarted(Activity activity) {
                try { startedActivities.add(activity); refresh(); } catch (Throwable error) { note("activity started", error); }
            }
            public void onActivityStopped(Activity activity) {
                try {
                    startedActivities.remove(activity);
                    refresh();
                    if (startedActivities.isEmpty()) { handler.removeCallbacks(poll); handler.postDelayed(poll, POLL_MS); }
                } catch (Throwable error) { note("activity stopped", error); }
            }
            public void onActivityCreated(Activity activity, Bundle savedInstanceState) {}
            public void onActivityResumed(Activity activity) {}
            public void onActivityPaused(Activity activity) {}
            public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}
            public void onActivityDestroyed(Activity activity) { startedActivities.remove(activity); }
        };

        Controller(Context context) {
            this.context = context;
            windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
            audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        }

        void attach(final Activity activity) {
            handler.post(safe("attach", new Runnable() {
                public void run() {
                    if (activity != null && !activity.isFinishing() && isProcessForeground()) startedActivities.add(activity);
                    if (attached) return;
                    attached = true;
                    Context app = context.getApplicationContext();
                    if (app instanceof Application) ((Application) app).registerActivityLifecycleCallbacks(callbacks);
                }
            }));
        }

        void detach() {
            handler.post(safe("detach", new Runnable() {
                public void run() {
                    Context app = context.getApplicationContext();
                    if (attached && app instanceof Application) ((Application) app).unregisterActivityLifecycleCallbacks(callbacks);
                    attached = false;
                    startedActivities.clear();
                    handler.removeCallbacks(poll);
                    enabled = false;
                    hide();
                }
            }));
        }

        boolean isProcessForeground() {
            try {
                ActivityManager.RunningAppProcessInfo info = new ActivityManager.RunningAppProcessInfo();
                ActivityManager.getMyMemoryState(info);
                return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
            } catch (Throwable error) {
                return false;
            }
        }

        boolean canDraw() {
            try {
                return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
            } catch (Throwable error) {
                return false;
            }
        }

        void openPermissionSettings() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
            Uri uri = Uri.parse("package:" + context.getPackageName());
            try {
                context.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Throwable error) {
                context.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            }
        }

        void setState(final boolean inCall, final boolean isMuted, final boolean isDeafened, final boolean isEnabled, final int[] which, final boolean isSharing) {
            handler.post(safe("setState", new Runnable() {
                public void run() {
                    bubbleEnabled = isEnabled;
                    reportedInCall = inCall;
                    muted = isMuted;
                    deafened = isDeafened;
                    sharing = isSharing;
                    boolean resized = !java.util.Arrays.equals(buttons, which);
                    buttons = which;
                    if (bubble != null) {
                        bubble.buttons = buttons;
                        bubble.set(muted, deafened, sharing);
                        if (resized) {
                            // A different number of buttons: the bubble's size changes, so the window is told.
                            bubble.requestLayout();
                            try { if (params != null) windowManager.updateViewLayout(bubble, params); } catch (Throwable ignored) {}
                        }
                    }
                    refresh();
                }
            }));
        }

        boolean inCall() {
            if (reportedInCall) return true;
            try { return audio != null && audio.getMode() == AudioManager.MODE_IN_COMMUNICATION; } catch (Throwable error) { return false; }
        }

        /** Set when making the bubble failed: it is not tried again until the plugin restarts. */
        boolean broken;

        void refresh() {
            // Discord on screen (by Android's own account too, in case an activity was missed): no bubble.
            boolean show = !broken && enabled && bubbleEnabled && startedActivities.isEmpty() && inCall()
                && System.currentTimeMillis() >= hiddenUntil && canDraw() && !isProcessForeground();
            try {
                if (show) show(); else hide();
            } catch (Throwable error) {
                note(show ? "show" : "hide", error);
                if (show) {
                    broken = true;
                    try { hide(); } catch (Throwable ignored) {}
                }
            }
        }

        @SuppressWarnings("deprecation")
        int overlayType() {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        }

        @SuppressLint("ClickableViewAccessibility")
        void show() {
            if (bubble != null) return;
            float density = context.getResources().getDisplayMetrics().density;
            final WindowManager.LayoutParams layout = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
            layout.gravity = Gravity.TOP | Gravity.START;
            layout.x = savedX >= 0 ? savedX : (int) (12 * density);
            layout.y = savedY >= 0 ? savedY : (int) (180 * density);

            final BubbleView view = new BubbleView(context);
            view.buttons = buttons;
            view.set(muted, deafened, sharing);
            final int touchSlop = ViewConfiguration.get(context).getScaledTouchSlop();

            view.setOnTouchListener(new View.OnTouchListener() {
                float downX, downY;
                int startX, startY;
                boolean dragging;

                public boolean onTouch(View v, MotionEvent event) {
                    try { touch(event); } catch (Throwable error) { note("touch", error); }
                    return true;
                }

                private void touch(MotionEvent event) {
                    switch (event.getActionMasked()) {
                        case MotionEvent.ACTION_DOWN:
                            downX = event.getRawX();
                            downY = event.getRawY();
                            startX = layout.x;
                            startY = layout.y;
                            dragging = false;
                            view.pressed = view.buttonAt(event.getY());
                            view.invalidate();
                            break;
                        case MotionEvent.ACTION_MOVE: {
                            float dx = event.getRawX() - downX, dy = event.getRawY() - downY;
                            if (!dragging && (Math.abs(dx) > touchSlop || Math.abs(dy) > touchSlop)) {
                                dragging = true;
                                view.pressed = -1;
                                view.setAlpha(0.8f);
                                view.invalidate();
                            }
                            if (dragging) {
                                layout.x = startX + (int) dx;
                                layout.y = startY + (int) dy;
                                try { windowManager.updateViewLayout(view, layout); } catch (Throwable ignored) {}
                            }
                            break;
                        }
                        case MotionEvent.ACTION_UP:
                            view.setAlpha(1f);
                            if (dragging) {
                                savedX = layout.x;
                                savedY = layout.y;
                            } else {
                                onTap(view, view.buttonAt(event.getY()));
                            }
                            view.pressed = -1;
                            view.invalidate();
                            break;
                        case MotionEvent.ACTION_CANCEL:
                            view.setAlpha(1f);
                            view.pressed = -1;
                            view.invalidate();
                            break;
                    }
                }
            });

            try {
                windowManager.addView(view, layout);
                bubble = view;
                params = layout;
            } catch (Throwable error) {
                bubble = null;
                params = null;
            }
        }

        void hide() {
            BubbleView view = bubble;
            if (view == null) return;
            if (params != null) { savedX = params.x; savedY = params.y; }
            try { windowManager.removeView(view); } catch (Throwable ignored) {}
            bubble = null;
            params = null;
        }

        /** Shows the change straight away; the JS half then reports Discord's real state and the bubble follows it. */
        void onTap(BubbleView view, int which) {
            vibrate();
            if (which == LEAVE) {
                actions.send("disconnect");
                reportedInCall = false;
                hiddenUntil = System.currentTimeMillis() + 5000L;
                hide();
                handler.postDelayed(safe("refresh", new Runnable() { public void run() { refresh(); } }), 5100L);
                return;
            }
            if (which == SHARE) {
                if (sharing) {
                    sharing = false;
                    actions.send("stopShare");
                } else {
                    // Android asks before a screen share starts, and only while Discord is showing, so it is opened.
                    openDiscord();
                    actions.send("startShare");
                }
            } else if (which == DEAF) {
                deafened = !deafened;
                actions.send("toggleDeaf");
            } else {
                // Unmuting while deafened undeafens too, as in Discord.
                if (deafened) { deafened = false; muted = false; } else muted = !muted;
                actions.send("toggleMute");
            }
            view.set(muted, deafened, sharing);
        }

        /** Brings Discord to the front (allowed from the background because Discord may draw over other apps). */
        void openDiscord() {
            try {
                Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
                if (intent == null) return;
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                context.startActivity(intent);
            } catch (Throwable ignored) {}
        }

        @SuppressWarnings("deprecation")
        void vibrate() {
            try {
                Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                if (vibrator == null) return;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    vibrator.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE));
                else vibrator.vibrate(30);
            } catch (Throwable ignored) {}
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Plugin lifecycle and the methods the JS half calls.
    // ---------------------------------------------------------------------------------------------------------------
    private static volatile Controller controller;

    private static Context currentApplication() {
        try {
            return (Context) Class.forName("android.app.ActivityThread").getMethod("currentApplication").invoke(null);
        } catch (Throwable error) {
            return null;
        }
    }

    private static synchronized Controller ensureController(Context context) {
        if (controller != null) return controller;
        Context base = context != null ? context : currentApplication();
        if (base == null) return null;
        Context app = base.getApplicationContext() != null ? base.getApplicationContext() : base;
        final Controller next = new Controller(app);
        // A copy left by an earlier load of this plugin (a reinstall) is shut down first.
        Properties properties = System.getProperties();
        Object old = properties.get(REGISTRY_KEY);
        if (old instanceof Runnable) { try { ((Runnable) old).run(); } catch (Throwable ignored) {} }
        properties.put(REGISTRY_KEY, new Runnable() {
            public void run() { next.detach(); next.actions.send("stop"); }
        });
        controller = next;
        next.attach(null);
        return next;
    }

    private static boolean bool(List<?> args, int index, boolean fallback) {
        Object value = args != null && args.size() > index ? args.get(index) : null;
        return value instanceof Boolean ? (Boolean) value : fallback;
    }

    private static void register(ValencedBridge bridge, String name, Function1<List<?>, Object> handler) {
        bridge.registerMethod(PREFIX + name, handler);
    }

    private static void start(final PluginScope ctx) {
        try { ensureController(null); } catch (Throwable error) { note("start", error); }
        ctx.withAppContext(new Function1<Context, Unit>() {
            public Unit invoke(Context context) {
                try {
                    final Controller bubble = ensureController(context);
                    if (bubble != null) {
                        ctx.withAppActivity(new Function1<Activity, Unit>() {
                            public Unit invoke(Activity activity) {
                                try { bubble.attach(activity); } catch (Throwable error) { note("activity", error); }
                                return Unit.INSTANCE;
                            }
                        });
                    }
                } catch (Throwable error) { note("context", error); }
                return Unit.INSTANCE;
            }
        });
        ValencedBridge bridge = ctx.getBridge();
        register(bridge, "setState", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) {
                Controller bubble = ensureController(null);
                Object which = args != null && args.size() > 4 ? args.get(4) : null;
                if (bubble != null) bubble.setState(bool(args, 0, false), bool(args, 1, false), bool(args, 2, false), bool(args, 3, true), buttonsFrom(which), bool(args, 5, false));
                return Boolean.TRUE;
            }
        });
        register(bridge, "canDrawOverlays", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) {
                Controller bubble = ensureController(null);
                return bubble != null && bubble.canDraw();
            }
        });
        register(bridge, "openOverlaySettings", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) {
                final Controller bubble = ensureController(null);
                if (bubble == null) return Boolean.FALSE;
                bubble.handler.post(new Runnable() {
                    public void run() { try { bubble.openPermissionSettings(); } catch (Throwable ignored) {} }
                });
                return Boolean.TRUE;
            }
        });
        register(bridge, "nextAction", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) {
                Controller bubble = ensureController(null);
                return bubble == null ? "none" : bubble.actions.next();
            }
        });
        register(bridge, "lastError", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) { return lastError; }
        });
    }

    private static void stop() {
        Controller current;
        synchronized (VoiceBubble.class) { current = controller; controller = null; }
        if (current == null) return;
        current.detach();
        current.actions.send("stop");
        System.getProperties().remove(REGISTRY_KEY);
    }

    public static PluginBuilder getVoiceBubble() {
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
