# Flame Text

Turns the text you send into a **burning, animated GIF** of your words on fire, like the classic flaming-text logos. Switch it on, type a message, send it: the GIF goes out instead of the text.

The GIF is **drawn on your phone**. No website is used and nothing leaves your phone to make it.

## Switching it on and off

- **A flame button in the chat box.** Tap it to switch flame text on or off. It glows orange when it is on. By default it sits next to the send button (which shows while you type); you can also put it with the row of small buttons, or in both places.
- **`/flame`** in the `/` menu. With nothing typed after it, it switches flame text on or off. `/flame text:hello` sends "hello" as a flame GIF right now and leaves the switch alone (it is not held to the length limit).
- **A switch at the top of the settings.**

## What gets burned

While it is on, a message becomes a GIF unless it has something a picture cannot show. Those are sent as normal text:

- a link, code, a mention, a custom emoji or a timestamp (Discord draws those itself)
- a file or sticker that is already attached
- more letters than your limit (20, 40, 60, 100 or 150)
- an emoji or another alphabet (the flame font has letters, numbers and the usual marks; accents are dropped)

If making or saving the GIF fails for any reason, your message is **sent as the text you wrote**, so nothing is lost.

## Settings

- **Preview**: type some words and see the GIF drawn live, with a **Shuffle the flames** button.
- **Look**: fire colour (Fire, Blue, Green, Purple), size, flame height, background (Dark, White, See-through), movement (Still, Light, Normal, Smooth) and a glow.
- **Sending**: also send the words as text under the GIF, and the longest message to burn.
- **Ways to switch it**: the chat button (and where it goes) and the `/flame` command.
- **Copy logs and a self-check** at the bottom, made for finding out why it broke after a Discord update. The report has counts, yes/no answers and settings, and never your messages, chats or servers.

## How it works

1. The text is turned into dots with a small built-in font, joined into smooth bold letters.
2. Heat is swept upward from the letters, drifting, spreading and fading, so flames rise and taper; the noise slides upward from picture to picture and loops.
3. Heat becomes colour, and the pictures are written as a GIF (a colour list, LZW squeezing and a loop block), all in the plugin.
4. The GIF is saved with Discord's own file code and attached with Discord's own upload object, the way Discord's share and voice-message code sends a file.

Made by MarkLong0467.
