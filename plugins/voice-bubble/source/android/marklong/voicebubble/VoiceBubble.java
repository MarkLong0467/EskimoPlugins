/* SPDX-License-Identifier: GPL-3.0-or-later
 * Mute & Deafen Bubble for Valenced: the native half.
 * Based on Mute Bubble 3.3.3 by coder.gg (https://github.com/il1ll/ValencedPlugins, GPL-3.0), rewritten in Java
 * with a second button for deafen. MarkLong0467.
 *
 * A floating bubble over other apps while you are in a call and Discord is in the background. It has a mute button,
 * a deafen button, or both (mute on top), as chosen in the settings. Taps are handed to the JS half (nextAction),
 * which asks Discord to toggle.
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
import kotlin.coroutines.Continuation;
import kotlin.coroutines.intrinsics.IntrinsicsKt;
import kotlin.jvm.functions.Function1;
import kotlin.jvm.functions.Function2;

public final class VoiceBubble {
    private static final String PREFIX = "marklong.voicebubble.";
    private static final int BUTTON_DP = 52;
    private static final int GAP_DP = 8;
    private static final int PAD_DP = 4;
    private static final long POLL_MS = 3000L;
    private static final long WAIT_MS = 25000L;
    private static final String REGISTRY_KEY = "marklong.voicebubble.active";

    static final int MUTE = 0;
    static final int DEAF = 1;

    /** Which buttons the bubble has, from the settings ("both", "mute" or "deafen"). */
    static final int BOTH = 0, MUTE_ONLY = 1, DEAF_ONLY = 2;

    static int buttonsFrom(Object value) {
        if ("mute".equals(value)) return MUTE_ONLY;
        if ("deafen".equals(value)) return DEAF_ONLY;
        return BOTH;
    }

    // ---------------------------------------------------------------------------------------------------------------
    // The bubble: a dark pill with two round buttons, mic on top and headphones below. A button is red while on.
    // ---------------------------------------------------------------------------------------------------------------
    static final class BubbleView extends View {
        boolean muted, deafened;
        int buttons = BOTH;
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
            setContentDescription("Mute and deafen");
        }

        void set(boolean muted, boolean deafened) {
            this.muted = muted;
            this.deafened = deafened;
            invalidate();
        }

        float button() { return BUTTON_DP * density; }
        float pad() { return PAD_DP * density; }
        float gap() { return GAP_DP * density; }

        /** Which button a point inside the view is on: with both, the top half mutes and the bottom half deafens. */
        int buttonAt(float y) {
            if (buttons == MUTE_ONLY) return MUTE;
            if (buttons == DEAF_ONLY) return DEAF;
            return y < getHeight() / 2f ? MUTE : DEAF;
        }

        @Override
        protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
            int count = buttons == BOTH ? 2 : 1;
            setMeasuredDimension((int) (button() + 2 * pad()), (int) (count * button() + (count - 1) * gap() + 2 * pad()));
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float w = getWidth(), h = getHeight(), r = w / 2f;
            fill.setColor(0xF01E1F22);
            canvas.drawRoundRect(new RectF(0, 0, w, h), r, r, fill);
            float cx = w / 2f, size = button();
            float top = pad() + size / 2f, bottom = h - pad() - size / 2f;
            // The mic shows muted while deafened too, as Discord does.
            if (buttons != DEAF_ONLY) drawButton(canvas, cx, top, size, muted || deafened, pressed == MUTE, MUTE);
            if (buttons != MUTE_ONLY) drawButton(canvas, cx, bottom, size, deafened, pressed == DEAF, DEAF);
        }

        private void drawButton(Canvas canvas, float cx, float cy, float size, boolean on, boolean down, int which) {
            int background = on ? 0xFFDA373C : 0xFF2B2D31;
            if (down) background = on ? 0xFFA12828 : 0xFF404249;
            float radius = size / 2f - density;
            fill.setColor(background);
            canvas.drawCircle(cx, cy, radius, fill);
            if (!on) canvas.drawCircle(cx, cy, radius, ring);

            float unit = size / 40f;
            float left = cx - 12f * unit, top = cy - 12f * unit;
            fill.setColor(0xFFFFFFFF);
            stroke.setColor(0xFFFFFFFF);
            stroke.setStrokeWidth(2f * unit);
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
    // Taps waiting for the JS half. nextAction answers at once when a tap is waiting, otherwise it suspends (no thread
    // is held) until a tap comes or WAIT_MS passes.
    // ---------------------------------------------------------------------------------------------------------------
    static final class Actions {
        private final Handler handler;
        private final ArrayDeque<String> queue = new ArrayDeque<String>();
        private Continuation<Object> waiting;
        private Runnable timeout;

        Actions(Handler handler) { this.handler = handler; }

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
                handler.postDelayed(timeout, WAIT_MS);
            }
            // A JS reload can leave an older call waiting: it is answered so it can finish.
            if (previous != null) previous.resumeWith("none");
            return suspended();
        }

        /** Resume on the caller's own dispatcher; on Discord's main thread if the helper is missing from this build. */
        private static Continuation<Object> intercepted(Continuation<Object> continuation) {
            try {
                return IntrinsicsKt.intercepted(continuation);
            } catch (LinkageError missing) {
                return continuation;
            }
        }

        /** Kotlin's "this call has not finished yet" marker. */
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
            if (timeout != null) handler.removeCallbacks(timeout);
            timeout = null;
            return current;
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
        final Actions actions = new Actions(handler);

        final Set<Activity> startedActivities = new HashSet<Activity>();
        boolean reportedInCall, muted, deafened, enabled = true, bubbleEnabled = true, attached;
        int buttons = BOTH;
        BubbleView bubble;
        WindowManager.LayoutParams params;
        int savedX = -1, savedY = -1;

        final Runnable poll = new Runnable() {
            public void run() {
                refresh();
                if (bubble != null || startedActivities.isEmpty()) handler.postDelayed(this, POLL_MS);
            }
        };

        final Application.ActivityLifecycleCallbacks callbacks = new Application.ActivityLifecycleCallbacks() {
            public void onActivityStarted(Activity activity) { startedActivities.add(activity); refresh(); }
            public void onActivityStopped(Activity activity) {
                startedActivities.remove(activity);
                refresh();
                if (startedActivities.isEmpty()) { handler.removeCallbacks(poll); handler.postDelayed(poll, POLL_MS); }
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
            handler.post(new Runnable() {
                public void run() {
                    if (activity != null && !activity.isFinishing() && isProcessForeground()) startedActivities.add(activity);
                    if (attached) return;
                    attached = true;
                    Context app = context.getApplicationContext();
                    if (app instanceof Application) ((Application) app).registerActivityLifecycleCallbacks(callbacks);
                }
            });
        }

        void detach() {
            handler.post(new Runnable() {
                public void run() {
                    Context app = context.getApplicationContext();
                    if (attached && app instanceof Application) ((Application) app).unregisterActivityLifecycleCallbacks(callbacks);
                    attached = false;
                    startedActivities.clear();
                    handler.removeCallbacks(poll);
                    enabled = false;
                    hide();
                }
            });
        }

        boolean isProcessForeground() {
            ActivityManager.RunningAppProcessInfo info = new ActivityManager.RunningAppProcessInfo();
            ActivityManager.getMyMemoryState(info);
            return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
        }

        boolean canDraw() {
            return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context);
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

        void setState(final boolean inCall, final boolean isMuted, final boolean isDeafened, final boolean isEnabled, final int which) {
            handler.post(new Runnable() {
                public void run() {
                    bubbleEnabled = isEnabled;
                    reportedInCall = inCall;
                    muted = isMuted;
                    deafened = isDeafened;
                    boolean resized = buttons != which;
                    buttons = which;
                    if (bubble != null) {
                        bubble.buttons = buttons;
                        bubble.set(muted, deafened);
                        if (resized) {
                            // One button or two: the bubble's size changes, so the window is told.
                            bubble.requestLayout();
                            try { if (params != null) windowManager.updateViewLayout(bubble, params); } catch (Throwable ignored) {}
                        }
                    }
                    refresh();
                }
            });
        }

        boolean inCall() {
            return reportedInCall || audio.getMode() == AudioManager.MODE_IN_COMMUNICATION;
        }

        void refresh() {
            boolean show = enabled && bubbleEnabled && startedActivities.isEmpty() && inCall() && canDraw();
            if (show) show(); else hide();
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
            view.set(muted, deafened);
            final int touchSlop = ViewConfiguration.get(context).getScaledTouchSlop();

            view.setOnTouchListener(new View.OnTouchListener() {
                float downX, downY;
                int startX, startY;
                boolean dragging;

                public boolean onTouch(View v, MotionEvent event) {
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
                    return true;
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
            if (which == DEAF) {
                deafened = !deafened;
                actions.send("toggleDeaf");
            } else {
                // Unmuting while deafened undeafens too, as in Discord.
                if (deafened) { deafened = false; muted = false; } else muted = !muted;
                actions.send("toggleMute");
            }
            view.set(muted, deafened);
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
        ensureController(null);
        ctx.withAppContext(new Function1<Context, Unit>() {
            public Unit invoke(Context context) {
                final Controller bubble = ensureController(context);
                if (bubble != null) {
                    ctx.withAppActivity(new Function1<Activity, Unit>() {
                        public Unit invoke(Activity activity) { bubble.attach(activity); return Unit.INSTANCE; }
                    });
                }
                return Unit.INSTANCE;
            }
        });
        ValencedBridge bridge = ctx.getBridge();
        register(bridge, "setState", new Function1<List<?>, Object>() {
            public Object invoke(List<?> args) {
                Controller bubble = ensureController(null);
                Object which = args != null && args.size() > 4 ? args.get(4) : null;
                if (bubble != null) bubble.setState(bool(args, 0, false), bool(args, 1, false), bool(args, 2, false), bool(args, 3, true), buttonsFrom(which));
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
        bridge.registerAsyncMethod(PREFIX + "nextAction", new Function2<List<?>, Continuation<?>, Object>() {
            public Object invoke(List<?> args, Continuation<?> continuation) {
                Controller bubble = ensureController(null);
                return bubble == null ? "none" : bubble.actions.next(continuation);
            }
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
