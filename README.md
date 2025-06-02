# bereal-gdpr-photo-toolkit

When you request your data from BeReal, you receive a ZIP file containing all the photos in WebP format. These files unfortunately don't contain any metadata such as when the photo was taken. This information is stored in a JSON file, which is great for processing the data but not easily human readable.

The script `process-photos.py` automates the process of converting the images to JPEG, along with renaming and updating the EXIF data using the information from the JSON file.

# Features

-   **Automatic Conversion:** Converts all BeReal WebP images to JPEG format for better compatibility and metadata support.
-   **EXIF & IPTC Metadata Injection:** Adds original capture date, geolocation, and caption to JPEGs using data from the BeReal JSON file.
-   **Filename Renaming:** Renames images to include the date/time and other relevant info, making them easier to browse and search.
-   **Image Combination:** Optionally combines the primary and secondary images into a single JPEG, simulating the original BeReal memory layout (with rounded corners and outline for the secondary image).
-   **BTS Support - Video Metadata:** Adds creation date metadata to MP4 videos.
-   **Static Metadata:** Adds static source information (e.g., `source = "BeReal app"`, `originating program = "github/bereal-gdpr-photo-toolkit"`) to all processed files.
-   **Customizable Workflow:** Prompts allow you to choose whether to convert to JPEG, preserve original filenames, and combine images.
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

The script processes images based on data provided in a JSON file obtained from BeReal. The JSON file should follow this format:

```json
[
    {
        "primary": {
            "path": "/path/to/primary/image.webp",
            "other": "data"
        },
        "secondary": {
            "path": "/path/to/secondary/image.webp",
            "other": "data"
        },
        "takenAt": "YYYY-MM-DDTHH:MM:SS.sssZ",
        "other": "data"
    }
]
```

# Advanced Settings

By default, the script converts images to JPEG, drops the original filenames from the converted filenames, and creates the combined images. Users have the ability to customize how the script behaves through a series of prompts:

1. **Conversion to JPEG:** Choose whether to convert WebP images to JPEG format.
2. **Filename Preservation:** Decide whether to keep the original filename within the new filename structure.
3. **Image Combination:** Opt in or out of combining primary and secondary images.

## Image Combine Logic

The script includes an option to combine the primary and secondary images into a single image, simulating the appearance of original BeReal memories. Using Pillow, the secondary image is resized and positioned on top of the primary image, with its corners rounded and an outline added.

The values used are:

```python
corner_radius = 60 # radius for the rounded corners
outline_size = 7 # thickness of the black outline
position = (55, 55) # margin to the borders
```

Adjust values if you want a different look or place the image in a different corner.

## Adding EXIF and IPTC tags

The script adds additional tags to the converted images. Currently these tags are supported:

-   geolocation
-   caption

On top of that, there is some static information added to the metadata, in order to help with referencing where the image came from. This information is:

```python
source = "BeReal app"
originating program = "github/bereal-gdpr-photo-toolkit"
```

When opening the image, this static information can look like this:
![](images/screenshot_iptc.png)

**It only works with JPEG images and mp4 videos (on videos only the creation date is added).**
