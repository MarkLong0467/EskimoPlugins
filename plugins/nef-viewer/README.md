# Raw Viewer

Shows **RAW photos as photos in chat**, and adds an **info sheet to every picture**: swipe up (or tap the `i` button) in
Discord's picture viewer to see when it was taken, where (with a map that opens Google Maps), and with which camera, lens
and settings.

This plugin was NEF Viewer. It keeps the same id (`marklong.nef-viewer`), so it updates in place and keeps its cache.

## What you get

- **RAW files as photos.** Nikon (`nef` `nrw`), Canon (`cr2` `cr3` `crw`), Sony (`arw` `srf` `sr2`), Adobe and many phones
  (`dng`), Olympus (`orf`), Panasonic and Leica (`rw2` `rwl`), Fujifilm (`raf`), Pentax (`pef`), Samsung (`srw`),
  Hasselblad (`3fr`), Epson (`erf`), Kodak (`kdc` `dcr`), Minolta (`mrw`), Mamiya (`mef`), Phase One (`iiq`) and Sigma
  (`x3f`) files are drawn as images with the right shape and orientation.
- **Picture info.** Open any picture in the viewer. An `i` button and a handle at the bottom appear. Tap the button or
  swipe up on the handle to open the info:
  - when it was taken (as the camera wrote it, with the time zone if it has one),
  - where, with a map. Tap the map or the coordinates to open **Google Maps**,
  - file name, size and dimensions,
  - camera, lens, shutter, aperture, focal length, ISO, exposure compensation, flash, software, artist and copyright.
  - Works for JPEG, PNG, WebP, HEIC and RAW files, and for pictures saved on the phone.
- **Render only when I ask.** Optional. RAW files then stay files until you hold the message and tap **Render RAW photo**.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Show RAW files as photos | on | Turns the conversion off (needs a reload) |
| Render only when I ask | off | Nothing is downloaded until you tap Render RAW photo in the message menu |
| Info button | on | The `i` button in the viewer |
| Swipe up for info | on | The handle at the bottom of the viewer |
| Map preview | on | Shows a map picture in the info |

## How it works

RAW files hold a full-size JPEG preview. The plugin uses that preview and never decodes the sensor data, which would be far
too slow on a phone.

1. **Spot.** Flux event handlers look at every message. An attachment whose name ends in a RAW extension counts.
2. **Queue.** At most two are converted at a time. With *Render only when I ask* the queue waits for the menu row.
3. **Find the preview** with HTTP Range requests, never the whole file:
   - TIFF based files (NEF, CR2, ARW, DNG, ORF, RW2, PEF, SRW...): the directories (IFD0, its chain and every SubIFD) are
     followed and the largest embedded JPEG is picked,
   - Fujifilm RAF: the preview position is read from the header,
   - anything else (Canon CR3, Sigma X3F...): the first 4 MB are searched for JPEGs and the largest one that is big enough
     is used.
4. **Orient, cache, swap.** The camera's orientation is added to the preview when it has none, the JPEG is written to
   Discord's cache folder (`nef-viewer/<attachment id>.jpg`) and the message is sent through Discord again with the photo in
   place of the file. Photos are kept across restarts.
5. **Info.** The plugin patches Discord's picture viewer (`MediaModalOverlay`) to draw the button and the handle. The sheet
   reads the metadata of the **original** file (the resized copy Discord shows has none) from the EXIF block: the TIFF
   header of RAW files, the Exif part of a JPEG, a PNG `eXIf` chunk or a WebP `EXIF` chunk. A RAW file converted by this
   plugin is read from the RAW file, not from the preview made from it.

## Privacy

- The map is **one picture from OpenStreetMap** (`tile.openstreetmap.org`). Their server sees the place, like any map.
  Turn *Map preview* off to load nothing: the coordinates still open Google Maps when you tap them.
- Everything else stays on the phone. Pictures are read from their own link, only as far as the metadata goes.

## Things to know

| Situation | What happens |
| --- | --- |
| The file has no JPEG preview, or the download fails | It stays a normal file and is not tried again until Discord reloads (Render RAW photo tries again) |
| A picture has no metadata (Discord removes it from some uploads) | The sheet says so |
| The picture is a video | No button and no handle |
| A cached file was deleted | Its entry is dropped and the photo is converted again |
| The plugin is turned off | Discord asks to reload, because messages already drawn keep the swapped photo |

The viewer's button, handle and message menu row are drawn by patching Discord's code, whose names can change. Anything
that goes wrong draws Discord's own screen.

## Files

`js/index.ts` starts everything. `patch.ts`, `queue.ts`, `convert.ts`, `attachments.ts` turn RAW attachments into photos;
`preview.ts`, `tiff.ts`, `jpeg.ts`, `http.ts`, `reader.ts` find and read the preview; `viewer.tsx` and `MetadataSheet.tsx`
are the button, handle and sheet; `picture.ts`, `exif.ts`, `format.ts` read and write the metadata; `menu.tsx` is the
Render RAW photo row; `Settings.tsx` is the settings screen.
