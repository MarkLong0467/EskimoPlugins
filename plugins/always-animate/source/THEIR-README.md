# Always Animate — Valenced 1.0.0-beta16

Install this ZIP in Settings → Valenced → Plugins → + → Install from ZIP / file.
Select the ZIP itself, enable Always Animate, then reload Discord once.
The exact file-picker label may differ between Valenced builds.

## Beta16: compact native settings screen

Settings-only update following the user's confirmation that beta15's animations,
emoji and HideBlockedAndIgnoredMessages compatibility work on their device.

The screen uses Discord's native TableRowGroup, TableSwitchRow, Text and Button
components where available, with accessible React Native fallbacks. It includes
a compact header/enabled count, playback status card and four grouped switches.
Technical diagnostics are collapsed under Troubleshooting. That section has a
small status summary, Refresh status, Copy report and a separately expandable
full report. The full report stays selectable if clipboard access is unavailable.
Status refresh discards late/unmounted requests and does not start a polling
loop. Dark/light fallback colours follow Discord's ThemeStore where available.

Validation: native/fallback controls, switch persistence, enabled count,
collapsed/expanded report behaviour, copy action, and small-screen layout review.
Existing JS/Android-APNG regression checks passed. Native phone rendering has not
been inspected. The animation/compatibility code outside SettingsComponent is
byte-for-byte identical to beta15 and the native JAR SHA256 is unchanged.
No animation backend was rebuilt or modified for this release.

Install the new ZIP over beta15 and reopen the settings screen (reload Discord
if the old screen remains cached).

## Beta15: HideBlockedAndIgnoredMessages compatibility and animated emoji

Beta14's frame playback is user-confirmed working. This update retains its
Android FastImage APNG switch and modern decoration URL changes.

The code review found a concrete grouped-message bug: createMessageContent
intentionally omits avatarURL and avatarDecorationURL when isFirst is false,
but the cached decoration fallback could add a frame back to that continuation.
Beta15 only fills a missing frame URL when the message has a nonempty avatar URL
and its presentation flags permit the avatar. It does not recreate rows removed
by other plugins or change relationship/whitelist/search settings.

Native fallback overlays now follow source visibility, ancestor visibility and
alpha, and the owning message's avatar visibility. A pre-draw observer pauses
and hides the overlay when the avatar/message is hidden, even without layout or
detachment; reappearance resumes its existing animation. Observers are removed
on detach/unload and only source alpha changed by the overlay is restored.
Unrelated presentation alpha values are preserved. Whole-tree diagnostic walks
and repeated forced per-row status-file writes were removed; one bounded delayed
check remains for newly loaded controllers.

Emoji handling now preserves Discord's static frozenSrc and only changes the
animated src when applicable. Native message.animateEmoji is enabled separately,
including at the final serialized chat handoff, which also covers cached rows.
The AnimateEmoji getSetting/useSetting path is overridden while the emoji switch
is enabled, with no persisted Discord preference changes. Image and emoji
switches work independently. Hidden spoilers and other message content stay
unchanged.

Compatibility was tested using the actual repository Valenced beta8 package:
https://github.com/Fluttershy2008-mlp/lol/blob/main/valenced/pool/dev.fluttershy2008.hide-blocked-and-ignored-messages%401.0.0-beta8.zip
Blob SHA: 0523d23302712d491f9993757e371ceb5dde565b.
Repository tree inspected: 793d7166dc83144faa59d26a9aaf32754aaa9036.
The repository/hiding plugin itself was not modified. Its whitelist, blocked and
ignored filtering, native group projection and relationship state were exercised
with both plugin load orders. The repository's Valenced patcher was used in the
combined test, with lightweight React stubs because no settings UI was rendered.

Checks:
- node tests/smoke.cjs
- node tests/apng-gate.cjs
- sh tests/run-native.sh
- HIDER_TEST_HARNESS=/absolute/path/to/repository/revenge-next/tests/next-harness.cjs node tests/hider-interoperability.cjs

The combined test needs the repository harness/dependencies and its generated
Valenced beta8 package (or the equivalent locally prepared test fixture). Native
regressions cover grouped/hidden avatar visibility, transparent/hidden parents,
visibility changes without layout, pause/resume without reloading, observer
cleanup, unchanged frame decoding and controller playback. These local checks
passed; the compatibility and emoji changes still need testing on the phone.
Replace beta14 and fully restart Discord.

Sources inspected:
- https://github.com/Fluttershy2008-mlp/lol/tree/main/hide-blocked-and-ignored-messages
- https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/modules/messages/native/renderer/createMessageContent.tsx
- https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/modules/markup_v2/native/transformNativeMarkupEmoji.tsx

## Beta14: Android FastImage APNG gate and modern shop decoration URLs

Inspection of the supplied `marklong.always-animate@2.1.0.zip` identified two
missing paths. Both are corroborated in the Discord JavaScript source mirror:
`FastImageApngExperiment.tsx` calls
`NativeImageManagerModule.setFastImageApngEnabled` with a user experiment whose
default is false, and `CollectiblesAssetUtils.tsx` builds modern decoration URLs
under `/media/v1/collectibles-shop/`. AvatarUtils can request their `/static`
variant even when callers request animation. Earlier builds only recognised
legacy `/avatar-decoration-presets/*.png` URLs. That left modern decorations
ineligible for the native fallback and URL rewriting.

Beta14 requests the native FastImage APNG decoder during init/start and guards
later calls so Discord cannot change it to false while image animation is on.
The native bridge, React Native NativeModules and TurboModuleRegistry discovery
routes are supported. Bounded retries handle delayed module availability.
Settings report whether the switch was found, requested, wrapped and errored;
a successful request does not itself prove the decoder is active on screen.
Turning off image overrides passes subsequent Discord values through. Cleanup
restores the last observed Discord setting when known; when the initial value
was unreadable, a full Discord restart restores normal experiment setup.

Modern `/collectibles-shop/<sku>/[asset/]static` URLs become `/animated` at image
helpers and the final native chat handoff. Legacy preset PNGs request
passthrough=true. Cached decoration metadata containing only a SKU is supported.
The native recogniser, request recovery and fallback downloader accept the
modern animated URLs without requiring a `.png` suffix. No external host is
rewritten or accepted by the native downloader. Text, attachments and embeds
remain unchanged.

The uploaded ZIP was inspected as a reference and remains unchanged. Its native
JAR is not redistributed in this build. The existing plugin's compiled native
helper and bundled PNG decoder remain in use. MarkLong0467 is credited for the
reference and discovery of these two paths.

Sources inspected:
- https://github.com/MarkLong0467/EskimoPlugins/blob/main/plugins/always-animate/index.js
- https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/components_native/common/FastImageApngExperiment.tsx
- https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/modules/collectibles/utils/CollectiblesAssetUtils.tsx
- https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/utils/AvatarUtils.tsx

Validation: `node tests/apng-gate.cjs`, `node tests/smoke.cjs`, and
`sh tests/run-native.sh`. Checks cover the four native-module discovery modes,
initial and later decoder flags, settings/cleanup, modern and legacy routes,
SKU-only metadata, unchanged content, and real APNG decode/playback through a
modern URL. This is local verification; the user's Android playback remains
unverified. Replace beta13, keep one Always Animate copy enabled, fully restart
Discord, and reopen the chat.

## Beta13: provide the missing decoration input and recover direct-controller URLs

The beta12 report has the bundled player ready with no errors, but zero frame
views, loads or decoded animations after 209 message binds. The sampled native
decoration view has zero dimensions and an unknown image source. Playback-only
changes cannot fix a player that never receives an asset. This report proves
that no eligible decoration URL reached the plugin; it does not by itself prove
that every message's decoration field was null.

Code review found that the final native chat handoff only changed existing
animated base-avatar URLs. It never restored a missing decoration URL. Beta13
uses cached UserStore/member data or inline avatar-decoration metadata to add
`avatarDecorationURL` to native message records before serialization. It supports
the documented `avatar_decoration_data.asset` and the client's camelCase model
fields. Author IDs can also be recovered from a Discord avatar URL. Existing
nonempty decoration URLs are preserved, and explicit null inline decoration data
is respected. Per-server cached member decoration data takes precedence over
global user data when available. No extra Discord API calls are made. Missing
cached metadata leaves the record unchanged. CDN asset requests use a PNG URL
with size=256 and passthrough=true, never a guessed GIF decoration URL.

Some native loaders assign a Fresco controller directly, bypassing image-URL
setters. Beta13 also reads bounded retained String/Uri request fields from the
actual controller. A recovered decoration PNG can feed the bundled decoder even
when the native message model and setter hooks expose no URL. Hidden/zero-size
views defer loading until a visible layout exists. A layout listener starts the
player after the decoration view is measured, avoiding an invisible 0x0 player.

Settings now put decoration store/cache/injection counters first. Controller
reports contain only avatar and decoration views, so bot/reply/badge icon rows
no longer crowd out relevant entries. User IDs and actual image URLs are not
included in diagnostics.

Local JS tests cover frozen and serialized native messages with a missing frame
URL, cached/inline/member metadata, inferred author IDs, explicit absence,
existing values, settings and text/attachment preservation. Native regression
checks recover a decoration Uri from an opaque controller request without a URL
setter or message field, then start real PNG decoding after zero-size layout
becomes visible. The existing native controller, APNG pixel-composition and
lifecycle suites pass. These checks are local; actual cached metadata and native
schema compatibility on the user's phone still need verification.

Metadata reference: https://github.com/discord/discord-api-docs/blob/main/developers/resources/user.mdx

Replace beta12, fully restart Discord and reopen a chat with an animated frame.
If it remains still, the leading counters distinguish missing user-store data
from successful URL injection and subsequent native loading failure.

## Beta12: inspect and restart the actual Fresco controllers in chat

The supplied view-tree finding identifies SimpleDraweeView instances around
120x120 and 144x144. Beta12 reads the controller and its Animatable for both
`author_avatar` and `author_avatar_decoration`. It resumes a stopped animation
and leaves a running animation alone. The existing controller lookup supports
R8-renamed getters through their Android Animatable return type.

A live Fresco decoration takes priority over the bundled APNG fallback. If a
native animation becomes available asynchronously, its controller getter hook
starts it and removes any fallback overlay. Reattachment checks the controller
again, including decorations that have no retained animated-avatar request URI.
Recycled views reject completions from their previous controllers. The native
message/image hooks still request GIFs for existing a_ base avatars; decorations
keep their PNG/APNG asset handling when there is no native animation.

**Chat image controllers** appears first in settings diagnostics. Each bounded
view record includes resource name, instance tag, actual pixel dimensions,
source format, controller class, animation class or absence, running state,
restart count and the last successful start transition. Snapshot phases include
message bind, 250 ms, 1000 ms, controller result and reattachment. Delayed work
is replaced on row reuse and cleared when disabling the plugin. Additional
Fresco children are inspected read-only: matching 120/144 dimensions alone never
authorises animating an attachment. No URLs, messages or user identifiers are
included in this report.

A null Animatable is labelled **none-yet (pending or still)**. It does not prove
a static decode until loading has completed. This distinction prevents a slow
load from being misdiagnosed as a still image. The report helps decide whether
to address playback or the earlier request/decoder path.

Local regression checks cover both 120x120 and 144x144 controllers, resume versus
already-running playback, report contents, asynchronous native takeover from
the fallback, reattachment without request fields, stale controllers, unrelated
images and cleanup. Existing native avatar, APNG compositing and JS checks also
pass. These are local tests; playback on the user's phone is unverified.

Controller API reference: https://frescolib.org/docs/animations.html

Replace beta11 and fully restart Discord. Visit a chat, wait one second and
reopen settings to inspect the new controller report.

## Beta11: ship the frame decoder instead of finding Discord's player

The beta10 device report identifies both failed dependencies:
`managed URL player not found` and `apng-config-not-found`. Native chat image
hooks are active, but no frame player can initialise. Beta11 removes both
Discord APNG player lookups. No Discord class name, Config constructor, cache
identifier or Kotlin callback property is used for frame playback.

A bundled Java APNG reader reconstructs PNG frame data, validates chunk CRCs,
and composites SOURCE/OVER blending and NONE/BACKGROUND/PREVIOUS disposal.
Android BitmapFactory decodes each reconstructed PNG; Android AnimationDrawable
loops the composed frames inside an ImageView over author_avatar_decoration.
This requires only Android framework image/view APIs. The native chat hook still
uses the previously working MessageView and SimpleDraweeView boundaries.

PNG download/decoding uses two background workers. UI assignment and playback
run on the Android main thread. The original static decoration stays visible
until decoding succeeds. Removing or recycling a row invalidates queued loads,
stops its animation, and restores its original decoration. Animated assets are
shared through immutable bitmap snapshots with independent drawable instances.
Input files are capped at 8 MiB, source canvases at 2048 pixels per side, and
animations at 600 frames. Playback is scaled to a maximum 192 pixels per side
with an 8 MiB decoded-frame budget per asset. The bitmap cache has a 16 MiB
budget and disk cache a 32 MiB budget. Active views can retain shared bitmaps
after cache eviction. Oversized or invalid assets keep the static fallback.

Frame player detail should now identify **bundled-APNG; Android AnimationDrawable**.
Last animation frame count reports the actual number of decoded PNG frames;
one frame means the requested asset itself was static.

Validation uses real APNG bytes, not a mock successful Discord player. PNG
frames are actually decompressed through desktop adapters for Android graphics
APIs, with exact pixel checks for frame offsets, transparency, blending and
disposal. Tests also cover a separate default PNG image, timing, corrupt data,
independent snapshots, native message image hooks, async UI handoff, looping,
layout, scrolling, stale completions and cleanup while all Discord APNG classes
are unavailable. These are local checks, not Android-device verification. CDN
access on the user's device and native chat presentation still need live testing.

The file format implementation follows https://www.w3.org/TR/png-3/.
The decoder is original plugin code and adds no external native library or APK.
Replace beta10, fully restart Discord and reopen a channel with animated frames.

## Beta10: bypass the failing frame-player configuration lookup

The beta9 device report shows native chat hooks running (188 messages bound,
155 avatar views reached) but `Chat frame player: unavailable-IllegalStateException`,
with no frame views or loads. This identifies player setup as a blocker; the
exception type alone does not identify its nested cause.

Beta10 first uses Discord's APNGManagedView URL entry point, the same one called
by its React Native APNGView component. This route does not require finding or
constructing APNGView.Config, or finding its callback setter. The existing
native player handles downloading, caching, PNG decoding and autoplay. Discovery
accepts renamed classes/methods and an R8-inlined View+String manager setter,
anchored on the native component's `animated_pngs` cache identifier. The former
Config route remains an older-build fallback.

The player reports successful decoding through its native event interface. Only
then is the static decoration hidden. Managed children are measured after being
inflated, and detaching a message resets the old decoder so reattachment starts
again. Resolution errors now include stage and nested exception messages under
**Frame player detail**, with image URLs scrubbed.

Local regression fixtures explicitly deny access to APNGView/Config and still
load via the managed URL entry point. Tests cover ordinary and renamed methods,
an inlined manager, decode callback, actual child bounds, scroll reset/reload,
row reuse, stale callbacks and cleanup. The existing avatar/JS/legacy-player
fixtures also pass. This is local verification; playback on the user's Discord
build remains unverified.

Source entry points inspected:
- https://github.com/Wumpus-Central/midroid/blob/alpha/src/com/discord/animated_png/APNGManagedView.kt
- https://github.com/Wumpus-Central/midroid/blob/alpha/src/com/discord/animated_png/react/APNGViewManager.kt
- https://github.com/Wumpus-Central/midroid/blob/alpha/src/com/discord/image/animated_image/apng/APNGImageView.kt

Replace the old ZIP and fully restart Discord, then open a chat containing an
animated decoration. Check **Chat frame player**, **Chat frames decoded**, and
**Frame player detail** if it remains still.

## Fix in beta9: the animated decoration around chat avatars

The reported pink angry frame is an avatar decoration, separate from the user's
profile picture. Earlier builds targeted animated base avatar GIFs and did not
animate this frame. Discord's native message row uses a SimpleDraweeView for
`author_avatar_decoration`; Fresco decodes its PNG as a still image.

Beta9 uses Discord's existing APNGView for this specific chat decoration. It
loads the decoration's original PNG asset with `passthrough=true` and animation
enabled, positioned exactly over the native decoration view. The base avatar,
message text and tap targets remain unchanged. The original frame stays visible
until APNG decoding succeeds. Layout listeners align it after row size changes;
recycled rows switch assets, detached rows remove their overlay, and disabling
the plugin restores the native frame and removes listeners. A native message
binder fallback handles builds that inline image setters. Widget and Config
resolution support R8-renamed classes through Valenced's DexFinder, with method
signatures used instead of APNG method names.

Settings now call these **animated frames**. Diagnostics include Chat frame
player, views, loads, decoded and errors, separate from base avatar GIF counts.
Replace the previous installation and fully restart Discord. The existing
Avatars/frames switch controls these decorations too; reopen the channel after
changing it.

Local JVM fixtures cover PNG transport, autoplay config, exact frame placement,
async completion, layout changes, scroll detach/reattach, row reuse, removal,
native binder fallback, and disable cleanup. Existing JS and avatar fixtures
also pass. These fixtures are not on-device verification: Discord versions can
change private native classes, and this build has not been tested on the user's
phone.

Sources inspected: Discord's CDN reference (PNG avatar decorations), native
MessageView/APNGView implementation in Wumpus-Central/midroid, Fresco's
DefaultImageDecoder and Valenced's Message Logger native view IDs. No APNG
library or Discord class is bundled; the player already inside Discord is used.

## Fix in beta8: play the actual chat avatar controller

Beta7 device diagnostics showed 49 native message binds, no native avatar URL
matches, and 28 GIF avatar URLs in the JS handoff. The native binder therefore
could not depend on finding a_ URLs in the Message model or a retained request.

Beta8 registers the actual author_avatar view's controller for playback after
binding, even when no matching URL is visible in the native model. Its
Animatable result determines whether an animation is available; static decoded
images return no Animatable. Separately, the native SimpleDraweeView String/Uri
image-loading overloads are hooked by signature, so an a_ avatar URL can be
converted at the image setter itself. This applies only to author_avatar views.
The setter marks the newly created controller directly, without traversing its
request object. Existing controller-attachment support remains available.

New counters: Chat image setter hooks, Chat image loads and Chat animated image
loads. No raw avatar URLs or message contents are logged. Local fixtures cover
an opaque message model, a controller which retains no request, a renamed image
setter, and an existing GIF row which emits neither a setter hook nor an attach
event. They verify asynchronous playback, static-image and attachment-view
preservation and cleanup. These are local fixtures; the device result remains
unverified until installation.

## Fix in beta7: avatars beside messages in native chat

User testing confirmed beta6 animates avatars in the Messages/home list, while
avatars beside messages in DMs remain still. Beta7 adds a native MessageView bind
hook, the same class/method lookup used by Valenced's community Message Logger.
It recognizes existing animated avatar URLs on the native Message model and
converts them before the author-avatar request is constructed. After binding,
it finds the author_avatar view by its Android resource ID and prepares/starts
that view's controller. Controller lookup also supports renamed getter methods.

This covers message rows rebound while already attached, which can bypass a
fresh controller-attachment event. The same native MessageView is used for
ordinary DM and server messages. AVIF animated-avatar paths and format overrides
are now converted as well as WebP, PNG and JPEG. Static avatars stay static.
Text/content fields are excluded from native model URL rewriting.

The settings page adds Chat avatar hooks, Messages bound, Chat animated avatar
URLs, Chat GIF rewrites and Chat avatar views reached. These counters identify
whether the message-specific path is reached rather than only the home list.

Local fixtures verified native binding before image-request construction,
already-attached row rebinds, renamed view-controller getters, WebP and AVIF,
async playback through the controller getter, static-avatar/text preservation
and removal of hooks. On-device DM/server playback remains unverified here.

Implementation references:
- https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/message-logger/src/main/kotlin/me/palmdevs/valenced/messagelogger/LoggerHooks.kt
- https://github.com/Wumpus-Central/midroid/blob/alpha/src/com/discord/chat/presentation/message/MessageView.kt
- https://github.com/Wumpus-Central/midroid/blob/alpha/src/com/discord/chat/bridge/MessageKt.kt
- https://github.com/Wumpus-Central/midroid/blob/alpha/src/com/discord/image/fresco/SetOptionalImageUrlKt.kt

The latter reference is a reverse-engineered snapshot, so native lookup remains
guarded for Discord versions whose code differs from it. No source files from
that snapshot are redistributed in the ZIP.

## Fix in beta6: remove the failed native builder dependency

The beta5 screenshot showed the controller lookup succeeded, but startup then
aborted at `resolving-builder: controller-builder-not-found`. Beta6 removes
builder lookup from installation. It hooks the already-resolvable controller's
attachment and its Android Animatable getter, identified by its platform return
type. It does not require ControllerListener, a controller builder or the
image-completion method's original name.

Before controller attachment submits a request, the helper inspects bounded
request holders, including PipelineDraweeController's ImageRequest and
DataSourceSupplier references. Existing a_ avatar Uri fields are changed to GIF
before loading. Request fields can be renamed and final; the platform Uri type
identifies them. Existing static URI cache keys are cleared only when their
string value exactly equals the replaced request URI. Playback is started when
the controller supplies its animation object, including after image loading.

Native diagnostics now report controllers inspected, avatar request URIs and
native GIF rewrites. JS diagnostics separately count avatar string fields,
static avatar paths and raw a_ hash fields. Nested serialized rows/data payloads
are supported. These counters distinguish the URL-building path from native
playback. Fully stop and reopen Discord after installing.

Regression fixtures deliberately make controller-builder discovery unavailable.
They verify successful installation of the two controller hooks, rewriting a
renamed final WebP Uri field to GIF before attachment, asynchronous animation
playback, static-asset preservation, switches and cleanup. The actual Android
Discord installation has not been tested in this environment.

Native request/controller relationship references:
- https://github.com/meta/fresco/blob/main/drawee-backends/drawee-pipeline/src/main/java/com/facebook/drawee/backends/pipeline/PipelineDraweeController.java
- https://github.com/meta/fresco/blob/main/drawee/src/main/java/com/facebook/drawee/controller/AbstractDraweeControllerBuilder.java
- https://github.com/meta/fresco/blob/main/imagepipeline/src/main/java/com/facebook/imagepipeline/request/ImageRequest.java

The sections below retain the release history. Beta6 replaces beta4's required
builder lookup and beta3's named-listener implementation.

## Fix in beta5: convert avatar URLs at the final chat handoff

The a_ hash / GIF suggestion is applied at the boundary which sends rows to
Android's chat renderer, including rows cached or generated outside the patched
RowManager path. Current clients expose updateRows(ref, { rows }); older clients
expose NativeChatModule or DCDChatManager updateRows(ref, serializedRows).
Both paths are covered. User.getAvatarURL prototype methods are also hooked;
searching module-export properties alone cannot find those instance methods.

Animated Discord avatar paths are converted from PNG/WebP/JPEG to GIF and static
CDN query overrides such as format=webp or animated=false are removed. Existing
GIF URLs stay GIFs. Static avatars, external hosts, message text, attachments and
embeds are preserved. Fields in nested author avatar objects and reply-message
avatars are supported. Caller-owned cached/frozen rows are copied when needed.

The settings page now separately reports final chat handoff hooks, handoffs
inspected, animated avatar URLs seen, GIF avatar URLs sent, final URL changes and
user-model hooks. These counters show whether the final URL path is being
reached; they do not prove native playback. Counts can include an avatar more
than once when it passes multiple hooks or appears in multiple row updates.
No raw avatar URLs, user IDs, message text or account credentials are logged.

Local tests cover both handoff formats, static CDN overrides, rows bypassing
RowManager, frozen inputs, nested/reply avatars, static/text/attachment
preservation, settings and cleanup. Android playback on the user's particular
Discord build remains unverified. The beta4 native playback helper is retained.

Final handoff references:
- https://github.com/Valenced/valenced-community-plugins/blob/main/plugins/shiki-codeblocks/js/index.ts
- https://github.com/Valenced/valenced/blob/main/bundle/lib/modules/src/native/index.ts
- https://github.com/nexpid/RevengePlugins/blob/main/src/stuff/deps.ts
- https://github.com/nexpid/RevengePlugins/blob/main/src/stuff/types.tsx

## Fix in beta4: native classes renamed by Discord

User diagnostics from beta3 showed `unavailable-ClassNotFoundException`, zero
native hooks and zero playback starts. Beta4 removes the required named
ControllerListener class and adds Valenced's cached DexFinder lookup for the
controller attachment, image completion and controller-builder methods. Lookups
use retained Fresco diagnostic strings rather than original class names.
Request source URIs and the platform Animatable return type are recognized even
when the containing classes, getters and fields have been renamed by R8.

The helper now starts tracked animated avatar controllers after native image
completion and on reattachment. Its diagnostics show the lookup stage and the
resolved class names. Fully stop and reopen Discord after updating; check that
settings display **Build: 1.0.0-beta4** and **Android avatar helper: ready**.

A local regression fixture denied access to all canonical Fresco controller
class names and used renamed controller, builder, request, getter and URI fields.
It verified lookup fallback, animated-only playback, static-avatar preservation
and cleanup. Tests also cover the original class layout. This addresses the
specific class-loading failure shown in the screenshot, but playback on the
user's actual Discord installation remains unverified.

The version sections below document older changes; beta4 replaces beta3's
named-class builder/autoplay/listener implementation.

## Fix in beta3: Android chat avatars

Adds a compiled Android helper at `android/always-animate.jar` alongside the JS
plugin. The helper targets Fresco controllers loading existing animated Discord
user-avatar assets. It enables autoplay before controller construction and starts
the animation after asynchronous image loading and when the avatar reattaches.
This addresses the native playback layer which a GIF URL change alone does not
control. Server-icon handling from beta2 is retained.

After updating, fully close and reopen Discord so the native helper loads. In
the plugin settings, **Android avatar helper: ready** means the two native hooks
attached. Avatar loads and playback starts count helper activity. If the status
is unavailable, send that status and your Discord/Valenced versions.

Only avatars which already contain animated assets can move; a static profile
picture stays static. The native helper checks the Images switch in the shared
plugin settings and removes its hooks/listeners when the plugin stops.

Native Java compiled to Java 7 bytecode and converted to a DEX-containing JAR.
Host API compile stubs are excluded from the DEX. Local JVM fixtures verified
native hook registration, asynchronous load playback, reattachment, switch-off,
cleanup, and preservation of static avatars, icons and attachment images. These
fixtures do not replace testing on a physical Android Discord installation.

Native source: `source/android/AlwaysAnimateNative.java`.
Rebuild with `DX_JAR=/absolute/path/dx.jar sh source/android/build.sh`.
Native reference: https://github.com/meta/fresco (AbstractDraweeControllerBuilder,
AbstractDraweeController, ControllerListener).
DEX build tool used: DX 1.13, tracked in MIT App Inventor at
https://github.com/mit-cml/appinventor-sources/blob/master/appinventor/lib/android/tools/dx.jar
(Git blob SHA `8f688cdc61cd64ecae1f4ed5060a3d52c8b37822`; not distributed in this ZIP).

## Fixes in beta2

- Attach hooks in init, before the application renders and captures more function references.
- Directly patch the mobile memoized Avatar identified by getStatusSize and the GuildIcon class renderer.
- Supply animate=true when callers omit the prop (beta1 only changed existing booleans).
- Supply the actual ImageResolver animation arguments: getUserAvatarURL's second argument and canAnimate in member avatar and avatar decoration options.
- Convert avatarURL in native chat rows, with both type and rowType row formats.
- Recognize animated Discord image sources even when component names are anonymous or minified.
- Load saved settings explicitly, and display successful hook counts, transformation counts and attachment errors in settings.

These are code-level fixes to gaps in beta1. Live playback on the user's Discord
build remains unverified. If there is still no effect, send a screenshot of the
plugin settings diagnostic counts and the Discord/Valenced versions, and specify
whether the affected item is an avatar, server icon, emoji, banner or sticker.

## Features

- Prefer GIFs for existing animated Discord avatars, server icons and banners.
- Enable animation flags exposed by mobile avatar, emoji, banner, nameplate and gradient-role React components.
- Use animated emoji sources in native chat rows, including reply content.
- Loop APNG, Lottie and GIF stickers in native chat rows.
- Four switches in the plugin settings. Reopen the affected screen after changing one.
- Patch modules that load later; remove hooks and subscriptions on disable.
- No startup toast, polling timer, API key, or third-party network request.

## Compatibility and limits

Requires Valenced API 1.x. This is a mobile reimplementation of the Vencord idea,
not the desktop webpack code. Discord mobile's native UI may not expose every
desktop animation, particularly gradient roles, nameplates and some profile views.
Only media which already has an animated asset can animate. Static assets stay static.
Spoiler content is left alone. This does not autoplay videos or enable paid uploads.
Animation may use more battery and data.

Validated with a local JavaScript harness covering the exact Valenced loader expression,
early init, direct mobile avatar/icon hooks, actual resolver arguments, omitted
props, anonymous image components, both native row variants, lazy module discovery,
static assets, native emoji/sticker rows, settings switches, frozen input objects
and cleanup. ZIP structure checked against the current
Valenced manifest and installer sources. Not tested inside a live Android Discord
session; playback on a particular Discord build still needs device verification.
The settings page reports attached hooks; those counts are not a playback test.

## Source and licence

`index.js` is the ready-to-load script and is identical to `source/plugin.js`.
`tests/smoke.cjs` is the local test harness: `node tests/smoke.cjs`.
Licensed GPL-3.0-or-later; see LICENSE.

Original concept: Fiery / Vencord contributors.
- https://github.com/Vendicated/Vencord/tree/main/src/plugins/alwaysAnimate
- https://vencord.dev/plugins/AlwaysAnimate/

Valenced API and packaging references checked 4 November 2026:
- https://github.com/Valenced/valenced
- https://github.com/Valenced/valenced-community-plugins
- https://github.com/Valenced/valenced-plugin-cli
- https://github.com/Valenced/valenced/blob/main/android/api/src/main/kotlin/app/valenced/xposed/api/DexFinder.kt
- https://github.com/LuckyPray/DexKit

Mobile animation hook reference (Cynosphere, public domain / Unlicense):
- https://github.com/skullbite/VendettaPlugins/blob/master/plugins/AlwaysAnimate/src/index.ts

The mobile hook signatures were adapted to Valenced's callback conventions;
Valenced's before/after callbacks are different from Vendetta's.

Mobile implementation prepared for fluttershy_simper67.
