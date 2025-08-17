# bereal-gdpr-photo-toolkit

When you request your data from BeReal, you receive a ZIP file containing all your photos and videos. Images come in WebP format and videos in MP4 format, but unfortunately they don't contain proper metadata such as when the content was captured. This information is stored in a JSON file, which is great for processing the data but not easily human readable.

This toolkit provides **two ways** to process your BeReal data:

## 🖥️ Desktop Version (Recommended)

The script `process-photos.py` automates the process of converting images to JPEG and processing videos, along with renaming and updating metadata using the information from the BeReal JSON file.

## 🌐 Web Version (Browser-Based)

A complete web application that runs entirely in your browser using WebAssembly. No installation required - just upload your files and process them directly in the browser with complete privacy.

**[🚀 Try the Web Version](https://lettly.github.io/bereal-gdpr-photo-toolkit/web/index.html)** | **[📖 Web Version Documentation](web/README.md)**

### 🔄 Which Version Should I Use?

| Feature              | Desktop Version              | Web Version                      |
| -------------------- | ---------------------------- | -------------------------------- |
| **Setup Required**   | ✅ Python + Poetry           | ❌ None - just open in browser   |
| **Privacy**          | ✅ Complete                  | ✅ Complete (client-side only)   |
| **Performance**      | ✅ Fast                      | ⚠️ Slower (WebAssembly overhead) |
| **Image Processing** | ✅ Full support              | ✅ Full support                  |
| **Video Processing** | ✅ Full support + audio sync | ⚠️ Limited (no audio sync)       |
| **File Size Limits** | ✅ No limits                 | ⚠️ Browser memory limits         |
| **Offline Usage**    | ✅ Complete                  | ✅ After initial load            |
| **Cross-Platform**   | ✅ Windows/Mac/Linux         | ✅ Any modern browser            |

**Recommendation**: Use the **desktop version** for best performance and full features. Use the **web version** for convenience and when you can't install software.

# Features

## Image Processing

-   **Automatic Conversion:** Converts all BeReal WebP images to JPEG format for better compatibility and metadata support.
-   **EXIF & IPTC Metadata Injection:** Adds original capture date, geolocation, and caption to JPEGs using data from the BeReal JSON file.
-   **Image Combination:** Optionally combines the primary and secondary images into a single JPEG, simulating the original BeReal memory layout (with rounded corners and outline for the secondary image).

## Video Processing

-   **Full Video Support:** Processes MP4 videos from primary, secondary, and BTS media with complete metadata preservation.
-   **Video Metadata Injection:** Adds creation date, GPS coordinates (in multiple formats for maximum compatibility), and captions to MP4 videos.
-   **Smart Audio Synchronization:** Automatically detects when one video has audio and the other doesn't, then copies audio between them while preserving original quality.
-   **Quality Preservation:** Audio copying uses direct stream copying when possible to maintain original audio quality without re-encoding.
-   **Metadata Preservation:** Ensures all video metadata (timestamps, GPS, etc.) is preserved during audio copying operations.

## General Features

-   **Intelligent File Detection:** Automatically detects whether media is image or video and processes accordingly.
-   **Filename Renaming:** Renames all media files to include the date/time and other relevant info, making them easier to browse and search.
-   **Placeholder Skipping:** When videos are present, automatically skips processing placeholder images to avoid duplicates.
-   **Static Metadata:** Adds static source information (e.g., `source = "BeReal app"`, `originating program = "github/bereal-gdpr-photo-toolkit"`) to all processed files.
-   **Customizable Workflow:** Prompts allow you to choose whether to convert to JPEG, preserve original filenames, and combine images.
-   **Robust Error Handling:** Gracefully handles missing files and continues processing remaining media.
-   **Batch Processing:** Handles all images and videos in the exported BeReal data in one go.
-   **Cross-platform:** Works on macOS, Linux, and Windows (Python 3.12+ required).
-   **Safe Overwrite:** Will not overwrite your original BeReal files; outputs are saved separately.
-   **Verbose Logging:** Provides clear output about what is being processed and any issues encountered.

# Prerequisites

-   [Poetry](https://python-poetry.org/docs/#installing-with-pipx)
-   [mise (optional but suggested)](https://mise.jdx.dev/getting-started.html)
-   Python 3.12 or newer (3.13+ recommended)

## Request your data

Request your data according to Article 15 GDPR by using the in-app chat. You can generate a template using [datarequests.org](https://www.datarequests.org/generator/).

# Running the Script

1. **Request and Download Your Data:**
    - Use the BeReal app to request your data export.
    - Download the ZIP file when you receive it.
2. **Extract the ZIP:**

    - Place the ZIP file in this project folder and unzip it:

    ```console
    unzip -o <bereal_gdpr_file.zip>
    ```

3. **Install Dependencies:**

    - If using mise:

    ```console
    mise install
    mise run setup
    mise run process-photos
    ```

    - Or with poetry:

    ```console
    poetry install
    poetry run python process-photos.py
    ```

# Data Requirement

The script processes images and videos based on data provided in a JSON file obtained from BeReal. The JSON file should follow this format:

```json
[
    {
        "primary": {
            "path": "/path/to/primary/image.webp",
            "mediaType": "image",
            "other": "data"
        },
        "secondary": {
            "path": "/path/to/secondary/image.webp",
            "mediaType": "image",
            "other": "data"
        },
        "takenAt": "YYYY-MM-DDTHH:MM:SS.sssZ",
        "location": {
            "latitude": 12.345,
            "longitude": 67.89
        },
        "caption": "Optional caption text",
        "other": "data"
    },
    {
        "primary": {
            "path": "/path/to/primary/video.mp4",
            "mediaType": "video",
            "other": "data"
        },
        "secondary": {
            "path": "/path/to/secondary/video.mp4",
            "mediaType": "video",
            "other": "data"
        },
        "btsMedia": {
            "path": "/path/to/bts/video.mp4",
            "mediaType": "video",
            "other": "data"
        },
        "takenAt": "YYYY-MM-DDTHH:MM:SS.sssZ",
        "location": {
            "latitude": 12.345,
            "longitude": 67.89
        },
        "other": "data"
    }
]
```

# Advanced Settings

By default, the script converts images to JPEG, keeps the original filenames in the converted filenames, and does NOT create combined images. Users have the ability to customize how the script behaves through a series of prompts:

1. **Conversion to JPEG:** Choose whether to convert WebP images to JPEG format.
2. **Filename Preservation:** Decide whether to keep the original filename within the new filename structure.
3. **Image Combination:** Opt in or out of combining primary and secondary images (only applies to images, not videos).

## Image Combine Logic

The script includes an option to combine the primary and secondary images into a single image, simulating the appearance of original BeReal memories. Using Pillow, the secondary image is resized and positioned on top of the primary image, with its corners rounded and an outline added.

The values used are:

```python
corner_radius = 60 # radius for the rounded corners
outline_size = 7 # thickness of the black outline
position = (55, 55) # margin to the borders
```

Adjust values if you want a different look or place the image in a different corner.

## Adding Metadata Tags

The script adds comprehensive metadata to both images and videos using the information from the BeReal JSON file.

### Image Metadata (EXIF & IPTC)

For JPEG images, the following metadata is added:

-   **Creation date/time** - When the photo was taken
-   **GPS coordinates** - Geolocation where the photo was captured
-   **Caption** - Any text caption associated with the photo
-   **Static source information** - References the original source

### Video Metadata (MP4)

For MP4 videos, the following metadata is added:

-   **Creation timestamp** - When the video was recorded
-   **GPS coordinates** - Location data in multiple formats:
    -   ISO 6709 format (`+44.3304+113.0162/`)
    -   Apple QuickTime format (`com.apple.quicktime.location.ISO6709`)
    -   Alternative format (`location-eng`)
-   **Caption** - Video title/description
-   **Static source information** - References the original source

### Static Metadata

All processed files include static information to help identify their origin:

```python
source = "BeReal app"
originating program = "github/bereal-gdpr-photo-toolkit"
```

### Audio Synchronization

When processing videos, the script automatically:

-   Detects which videos have audio streams
-   Copies audio from videos with sound to those without
-   Preserves original audio quality using direct stream copying
-   Maintains all metadata during audio operations

When opening processed files, this metadata can look like this:
![](images/screenshot_iptc.png)

**Metadata injection works with JPEG images and MP4 videos. Videos receive comprehensive metadata including GPS coordinates in multiple formats for maximum compatibility.**
