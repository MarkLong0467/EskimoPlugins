# NEF Viewer

Shows Nikon RAW attachments (`.nef`, `.nrw`) as **photos in chat**, instead of as a file you have to download.

## What you get

- A RAW file posted in chat is drawn as an image, with the right shape and orientation (portrait shots stand upright).
- It also works inside forwarded messages and in messages loaded with a channel, pinned messages and recent mentions.
- A photo is converted once. After that it is kept on the phone and shows instantly, also after Discord restarts.
- The plugin has no settings. Install it and it works.

## How it works

Nikon cameras store a full-size JPEG preview inside every NEF file. The plugin uses that preview. It does **not** decode
the RAW sensor data, which would be far too slow on a phone.

1. **Spot.** Flux event handlers look at every message that passes through Discord. An attachment whose name ends in
   `.nef` or `.nrw` (any letter case) and that has a download link counts as RAW.
2. **Queue.** A RAW attachment with no preview yet is queued. At most two are converted at a time, and an attachment
   that is queued or has failed is never queued again.
3. **Find the preview.** The file is read with HTTP **Range** requests. First the head of the file (256 KB) is
   fetched. A NEF is a TIFF file, so the plugin follows its directories (IFD0, its chain and every SubIFD) and picks the
   largest embedded JPEG. A 10 MB NEF usually needs about 1 MB of downloads. A server that ignores Range and sends the
   whole file is handled too.
4. **Orient.** The camera's orientation is stored in the RAW file, not in the preview. If the preview has no EXIF block,
   a minimal one with the orientation is added, so the photo is not sideways. The size is reported turned for
   orientations 5 to 8.
5. **Cache.** The JPEG is written to Discord's cache folder (`nef-viewer/<attachment id>.jpg`) and added to an index
   (`nef-viewer/index.json`).
6. **Swap.** The message is sent through Discord again. This time the event handler swaps the attachment: the name gets
   a `.jpg` ending, the type becomes `image/jpeg`, and the link points at the cached file. Discord draws an image.

### Things to know

| Situation | What happens |
| --- | --- |
| The file has no JPEG preview, is not a TIFF, or the download fails | It stays a normal file and is not tried again until Discord reloads |
| A cached file was deleted | Its index entry is dropped and the photo is converted again |
| The index file is damaged | It is ignored |
| The plugin is turned off | Discord asks to reload, because messages already drawn keep the swapped photo |
| Forwarded copies of a RAW file | Swapped only if the original was already converted |

## Layout

```
js/
  index.ts        the plugin: wires the Flux event handlers and the queue
  patch.ts        rewrites the RAW attachments of one message
  attachments.ts  recognises a RAW attachment and builds the image attachment that replaces it
  queue.ts        the conversion queue and the message refresh
  convert.ts      downloads, orients and caches one preview, and keeps the index
  http.ts         a reader over a remote file that uses HTTP Range requests
  nef.ts          finds the JPEG in a TIFF/NEF file, reads JPEG sizes, adds an orientation
  base64.ts       base64 for binary data (Hermes has no dependable `btoa` for it)
  constants.ts    the file pattern, limits and event names
  types.ts        the Discord shapes the plugin uses
```

## Testing

`tests/nef-viewer.test.cjs` builds small NEF-shaped files (real TIFF structure, both byte orders, several SubIFDs) and
serves them from a fake server that supports Range requests. It checks the whole path, orientation, partial downloads,
the cache index, forwarded messages, failures, concurrency and shutdown:

```sh
bun run build nef-viewer
node tests/nef-viewer.test.cjs
```
