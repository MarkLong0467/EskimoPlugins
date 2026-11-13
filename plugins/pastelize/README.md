# Pastelize

Gives every name in chat its **own pastel colour**, so people who have no role colour (and everyone in DMs) are easy to tell apart.

After Pastelize for Vendetta by [Cynosphere](https://github.com/Cynosphere), written anew for Valenced.

## Using it

Turn it on and open a channel. Names with no role colour are coloured; names that have a role colour keep it.

The settings have three switches:

- **Colour everyone**: also recolours names that have a role colour.
- **Colour webhooks by name**: each name a webhook posts under gets its own colour (on by default). Off, the colour comes from the webhook's ID.
- **Colour mentions**: mentions of people with no role colour get their colour too (on by default).

Messages that are on the screen already change when you open the channel again.

## How it works

A colour is worked out from the person's ID alone: the ID is hashed (MurmurHash3), the hash picks a hue on the colour wheel, and the hue is drawn soft and light. The same person always has the same colour, on every phone, and the same one the Pastelize plugins for other clients give.

Discord's chat is drawn by native code from one object of data per message, which `RowManager.generate` makes. The plugin runs right after it and changes the colours in that data: the author's name, the name on the reply line, and mentions. Nothing of Discord is replaced, and the patch is taken off when the plugin stops.

The settings have a **What it found** section: `names` says how many messages were seen and how many names were coloured. **Copy logs** has the same counts.

## Limits

- Only the chat is coloured, not the member list or profiles.
- The original's "Pastelize message content" option (the whole message in the person's colour) is not in this version.
