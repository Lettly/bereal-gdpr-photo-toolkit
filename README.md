# BeReal GDPR Photo Toolkit

Process a BeReal GDPR export ZIP into browsable, better-tagged media.

BeReal exports store most useful context, such as capture time, location, and captions, in `posts.json` rather than directly in the photo or video files. This project rebuilds that context into the media files, renames them chronologically, and can recreate combined BeReal-style memories.

The toolkit currently has two interfaces:

- **Browser app** in `web/`: runs locally in the browser, keeps files on your device, and downloads or streams an output ZIP.
- **Python script** in `process-photos.py`: command-line processor for local/offline use.

## What It Does

- Reads a BeReal GDPR export ZIP and finds the single `posts.json` inside it.
- Resolves media referenced by `posts.json`, including nested archive paths.
- Processes primary, secondary, and BTS media.
- Renames files with the post timestamp and role, for example `2024-01-31T18-42-05_primary.jpg`.
- Converts WebP images to JPEG when enabled.
- Adds JPEG EXIF metadata for capture date, GPS coordinates, and caption.
- Adds JPEG IPTC metadata for caption, source, and processing tool.
- Adds MP4 metadata for creation time, GPS location, and caption/title.
- Synchronizes audio between paired primary and secondary videos when only one side has audio.
- Optionally creates combined BeReal-style images with the secondary image overlaid on the primary image.
- Skips missing files and continues processing the rest of the export.

## Browser App

The browser app is the recommended interface for most users. It processes the ZIP client-side; the export is not uploaded to a server.

The app loads JSZip and piexifjs from pinned jsDelivr CDN URLs, and loads ffmpeg.wasm from this repository under `web/vendor/ffmpeg/`.

### Run Locally

With `mise`:

```console
mise install
mise run web
```

Then open `http://localhost:8000`.

Without `mise`, serve the `web/` directory with any static file server:

```console
python -m http.server 8000 --directory web
```

### Browser Features

- Drag-and-drop ZIP selection.
- Image conversion and metadata injection.
- Optional date range filtering.
- Optional combined images.
- Optional video metadata and audio sync using vendored `ffmpeg.wasm`.
- Output ZIP generation with `STORE` compression to avoid unnecessary recompression of JPEG/WebP/MP4 media.
- Streaming output directly to disk in browsers that support the File System Access API; otherwise it falls back to an in-memory download button.

The vendored ffmpeg.wasm runtime keeps the ffmpeg worker same-origin, which avoids browser restrictions on cross-origin workers.

## Python Script

Use the Python script if you prefer a CLI workflow or want direct filesystem output instead of an output ZIP.

### Requirements

- Python 3.13 or newer.
- Poetry.
- `ffmpeg` and `ffprobe` available on `PATH` for video metadata and audio sync.
- `mise` is optional, but it installs the expected Python, Poetry, and ffmpeg tools for this project.

### Install And Run

With `mise`:

```console
mise install
mise run setup
mise run process-photos -- /path/to/bereal-export.zip
```

With Poetry directly:

```console
poetry install
poetry run python process-photos.py /path/to/bereal-export.zip
```

By default, processed media is written to the Git-ignored `output/` directory. Use `--output` to choose a different folder:

```console
poetry run python process-photos.py /path/to/bereal-export.zip --output /path/to/output-folder
```

### Python Defaults

Unless you enter advanced settings, the script uses these defaults:

- Convert copied images from WebP to JPEG.
- Do not keep the original filename in the output filename.
- Do not create combined images.

If advanced settings are enabled, the script asks whether to convert images, whether to keep original filenames, and whether to create combined images.

## Output Layout

The Python script writes files directly to the output folder:

```text
output/
  2024-01-31T18-42-05_primary.jpg
  2024-01-31T18-42-05_secondary.jpg
  2024-02-01T09-12-33_primary.mp4
  2024-02-01T09-12-33_secondary.mp4
  2024-02-01T09-12-33_bts.mp4
  combined/
    2024-01-31T18-42-05_combined.jpg
```

The browser app creates the same `output/` layout inside a downloadable `bereal-output.zip`.

If duplicate names are produced, the toolkit appends a numeric suffix such as `_1`.

## Export Format

The ZIP must contain exactly one `posts.json`. Media files can be WebP, JPEG, JPG, or MP4. Each post is expected to reference primary and secondary media, and may also include BTS media, location, and caption data.

Example shape:

```json
[
  {
    "primary": {
      "path": "path/to/primary.webp",
      "mediaType": "image"
    },
    "secondary": {
      "path": "path/to/secondary.webp",
      "mediaType": "image"
    },
    "takenAt": "2024-01-31T18:42:05.000Z",
    "location": {
      "latitude": 45.4642,
      "longitude": 9.19
    },
    "caption": "Optional caption text"
  },
  {
    "primary": {
      "path": "path/to/primary.mp4",
      "mediaType": "video"
    },
    "secondary": {
      "path": "path/to/secondary.mp4",
      "mediaType": "video"
    },
    "btsMedia": {
      "path": "path/to/bts.mp4",
      "mediaType": "video"
    },
    "takenAt": "2024-02-01T09:12:33.000Z"
  }
]
```

## Metadata Details

### JPEG Images

When image conversion is enabled, output JPEGs receive:

- EXIF `DateTimeOriginal` from `takenAt`.
- EXIF GPS latitude and longitude when `location` is present.
- EXIF `ImageDescription` from `caption` when present.
- IPTC `Caption-Abstract` from `caption` when present.
- IPTC `Source` set to `BeReal app`.
- IPTC `Originating Program` set to `github/bereal-gdpr-photo-toolkit`.

If conversion is disabled, images are copied and renamed without adding metadata.

### MP4 Videos

When video metadata processing is enabled, output MP4s receive:

- `creation_time` from `takenAt`.
- GPS location in ISO 6709 format.
- Apple QuickTime location metadata.
- `location-eng` metadata.
- `title` from `caption` when present.

For primary/secondary video pairs, the toolkit checks audio streams. If one video has audio and the other does not, it copies the audio stream to the silent video while preserving the target video stream and metadata where possible.

## Combined Images

When enabled, combined images recreate the BeReal memory layout by drawing the secondary image on top of the primary image.

Current layout constants:

```python
corner_radius = 60
outline_size = 7
position = (55, 55)
scaling_factor = 1 / 3.33333333
```

Combined images are only created for image/image pairs. Posts containing video media are skipped for combined output.

## Deployment

The static web app is deployed to GitHub Pages by `.github/workflows/deploy-pages.yml` whenever files under `web/` or the workflow itself change on `main`. The workflow uploads the `web/` directory as the Pages artifact.

## Requesting Your BeReal Data

Request your data from BeReal through the app. You can use a GDPR access request template from [datarequests.org](https://www.datarequests.org/generator/) if you need one.

## Notes And Limitations

- The toolkit never modifies the original ZIP.
- The Python script extracts the ZIP to a temporary directory and writes processed media separately.
- The browser app keeps processing local to the browser, but large exports can still be memory-intensive, especially when video processing or combined images are enabled.
- Browser video processing downloads and runs the vendored ffmpeg.wasm runtime, which is roughly 30 MB.
- Metadata support varies by viewer. Some apps display EXIF/IPTC/QuickTime tags differently or ignore custom fields.

When opening processed files, the metadata can look like this:

![Metadata screenshot](images/screenshot_iptc.png)
