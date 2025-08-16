# BeReal GDPR Photo Toolkit - Web Application

A browser-based version of the BeReal GDPR Photo Toolkit that processes your BeReal photos and videos directly in your browser using WebAssembly and Pyodide.

## 🌟 Features

### ✅ Fully Client-Side Processing

-   **Complete Privacy**: All processing happens locally in your browser
-   **No Server Required**: No data is sent to any external server
-   **Offline Capable**: Works without internet connection after initial load

### 🖼️ Image Processing

-   **WebP to JPEG Conversion**: Converts BeReal WebP images to JPEG format
-   **EXIF Metadata Injection**: Adds capture date, GPS coordinates, and captions
-   **IPTC Metadata Support**: Includes source information and processing details
-   **Image Combination**: Creates combined images like original BeReal memories

### 🎥 Enhanced Video Support

-   **MP4 Video Processing**: Full support for MP4 files with timestamp-based renaming
-   **BTS Media Support**: Processes behind-the-scenes MP4 media files
-   **Audio Detection**: Detects presence of audio in video files
-   **Video Pair Recognition**: Identifies primary/secondary video pairs for potential audio sync
-   **Browser Limitations**: Audio synchronization requires desktop version with FFmpeg

### 🚀 Modern Web Interface

-   **Drag & Drop Upload**: Easy file upload with drag and drop support
-   **ZIP File Extraction**: Automatically extracts BeReal export ZIP files
-   **Real-time Progress**: Live progress tracking during processing
-   **Responsive Design**: Works on desktop and mobile devices

## 🚀 Getting Started

### Option 1: Local Development Server

1. **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd bereal-gdpr-photo-toolkit/web
    ```

2. **Start a local server:**

    ```bash
    # Using Python
    python -m http.server 8000

    # Using Node.js
    npx serve .

    # Using PHP
    php -S localhost:8000
    ```

3. **Open in browser:**
   Navigate to `http://localhost:8000`

### Option 2: Deploy to Static Hosting

Deploy the `web` folder to any static hosting service:

-   **Netlify**: Drag and drop the web folder
-   **Vercel**: Connect your repository
-   **GitHub Pages**: Enable Pages in repository settings
-   **Firebase Hosting**: Use Firebase CLI

## 📁 File Structure

```
web/
├── index.html          # Main HTML interface
├── styles.css          # Modern CSS styling
├── app.js             # Main application logic
├── worker.js          # Web Worker for processing
└── README.md          # This file
```

## 🔧 How It Works

### Technology Stack

-   **Pyodide**: Runs Python in the browser via WebAssembly
-   **PIL/Pillow**: Image processing and manipulation
-   **piexif**: EXIF metadata handling
-   **JSZip**: ZIP file extraction in the browser
-   **Web Workers**: Background processing to keep UI responsive

### Processing Pipeline

1. **File Upload**: Users upload BeReal export ZIP or individual files
2. **ZIP Extraction**: Automatically extracts ZIP files using JSZip
3. **Python Initialization**: Loads Pyodide and required packages
4. **File Processing**: Processes images with metadata injection
5. **Result Generation**: Creates downloadable ZIP with processed files

## ⚙️ Settings

### Image Conversion

-   **Convert to JPEG**: Converts WebP images to JPEG format (recommended)
-   **Keep Original Filename**: Includes original filename in output
-   **Create Combined Images**: Generates BeReal-style combined images

### Processing Options

-   **Metadata Injection**: Adds EXIF data including:

    -   Capture date and time
    -   GPS coordinates (if available)
    -   Image captions
    -   Source information

-   **Video Processing**: Handles video files by:
    -   Renaming with timestamps
    -   Preserving original quality
    -   Processing BTS media files
    -   Detecting audio streams
    -   Identifying video pairs for potential sync

## 🔒 Privacy & Security

### Data Privacy

-   **No Server Communication**: All processing happens locally
-   **No Data Storage**: Files are not stored anywhere except your device
-   **No Tracking**: No analytics or tracking scripts

### Browser Compatibility

-   **Modern Browsers**: Requires WebAssembly support
-   **Chrome/Edge**: Full support
-   **Firefox**: Full support
-   **Safari**: Full support (iOS 14+)

## ⚠️ Limitations

### Browser Constraints

-   **Memory Usage**: Large files may cause memory issues on mobile
-   **Processing Speed**: Slower than native desktop version
-   **Video Processing**: Limited video features compared to desktop

### Package Limitations

-   **FFmpeg**: Not available in browser (affects video audio sync)
-   **IPTC**: Limited IPTC support compared to desktop version
-   **File Size**: Browser memory limits affect maximum file sizes

## 🐛 Troubleshooting

### Common Issues

**"Out of Memory" Errors:**

-   Process fewer files at once
-   Close other browser tabs
-   Use desktop version for large datasets

**Slow Processing:**

-   WebAssembly is slower than native Python
-   Use desktop version for better performance
-   Process files in smaller batches

**Upload Issues:**

-   Ensure ZIP file contains posts.json
-   Check that image files are in WebP format
-   Verify file structure matches BeReal export format

### Browser Console

Check browser developer console for detailed error messages:

-   Press F12 to open developer tools
-   Check Console tab for error messages
-   Report issues with console logs

## 🔄 Comparison with Desktop Version

| Feature          | Web Version         | Desktop Version  |
| ---------------- | ------------------- | ---------------- |
| Privacy          | ✅ Complete         | ✅ Complete      |
| Image Processing | ✅ Full Support     | ✅ Full Support  |
| Video Processing | ✅ Enhanced Support | ✅ Full Support  |
| BTS Media        | ✅ Supported        | ✅ Supported     |
| Audio Detection  | ✅ Supported        | ✅ Supported     |
| Audio Sync       | ❌ Not Available    | ✅ Available     |
| Performance      | ⚠️ Slower           | ✅ Fast          |
| Setup Required   | ❌ None             | ✅ Python/Poetry |
| Offline Usage    | ✅ After Load       | ✅ Complete      |

## 🤝 Contributing

### Development Setup

1. Fork the repository
2. Make changes to web application files
3. Test locally using a development server
4. Submit pull request

### Reporting Issues

-   Use GitHub Issues for bug reports
-   Include browser version and console logs
-   Provide sample files if possible (without personal data)

## 📄 License

This project is licensed under the same license as the main BeReal GDPR Photo Toolkit.

## 🙏 Acknowledgments

-   **Pyodide Team**: For making Python in the browser possible
-   **PIL/Pillow**: For excellent image processing capabilities
-   **BeReal Users**: For providing feedback and testing

---

**Note**: This web version provides core functionality of the desktop toolkit while maintaining complete privacy by processing everything locally in your browser.
