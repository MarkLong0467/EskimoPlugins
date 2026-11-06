# Better Calls

Adds more options to calling: silent calls, and remembering the audio output device you want.

> **Credit.** This plugin was made by [PalmDevs](https://github.com/PalmDevs) (Discord ID `629368283354628116`).
> This is a 1:1 port of their [Revenge plugin](https://github.com/PalmDevs/revenge-plugins/tree/main/plugins/better-calls) to Valenced, published here by MarkLong0467. The idea, the code and the behaviour are PalmDevs'.
> Licensed GPL-3.0-or-later, like the original.

## What you get

### Silent Call

- A bell button at the top of a DM or group DM. Tap it to go through three choices for that DM:
  1. follow the global setting (a plain bell),
  2. **silent**: calling does not ring them (a bell with a Z),
  3. **ring**: calling always rings them (a phone).
- **Ring by default** sets what the global setting is. **Reset preferences** removes every choice you made.
- There is no button in bot DMs, and none while you are in the call, as in the original.
- You may need to switch between DMs and servers for a change to show, because Discord keeps the screens it has drawn.

### Remember Audio Output Device

- Pick the device you want (speaker, earpiece, Bluetooth, wired) and every call uses it.
- The speaker button of the call screen is replaced with one that opens a list of the phone's devices.
- If the saved device is unplugged, the first device is used.
- The list replaces Discord's own, so it may miss things such as moving a call to a console. The **Change Audio Output** option in the dock is still there.

## How it works

Starting a call goes through `CallActionCreators.ring`, which the plugin skips for silent calls. The button is added to `PrivateChannelButtons`, the buttons in a DM's header. The output device is chosen with the `NATIVE_AUDIO_SET_OUTPUT_DEVICE` action each time the voice panel's speaker button is drawn during a call.

## Differences from the original

These are fixes for how Valenced and Discord 354 work, not changes to what the plugin does:

- **The header.** Discord 354 draws the DM header as a row of the call, video and search buttons, where the original expected them inside a fragment. The silent call button goes in front of that row, and is left out for bots and while you are in the call.
- **Hooks.** Valenced's `after` hooks do not get the props, so the header and the speaker button are patched with `instead`, which runs Discord's own version first so its hooks still run on every draw.
- **The audio action.** `setAudioOutputDevice` is also a method of `MediaEngineStore`, which takes something else, so the plugin picks the module that is only the action.
- **Storage.** Valenced's storage merges objects, so removing one DM's choice replaces the whole setting.
- **Icons.** Discord's old icon names are tried after the current ones.
- The link to the original's feature requests is left out of the device list.

## Debugging

At the bottom of the settings is a debugging section that is not in the original:

- **Copy logs** puts a report on the clipboard: the plugin and Discord versions, your phone, the settings, what was found and patched, how many calls were silent and the kinds of device. It holds no names of people or devices.
- **Run self-check** shows which parts were found. The header and the speaker button are only found once you open a DM or join a call.

## Source

Files: [`plugins/better-calls`](.). Original: <https://github.com/PalmDevs/revenge-plugins/tree/main/plugins/better-calls>
