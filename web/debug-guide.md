# Debug Guide for Large ZIP Files

## 🔍 Troubleshooting Large ZIP File Processing

This guide helps you debug issues when processing large BeReal ZIP files in the web version.

### 📊 Memory Limits by Browser

| Browser         | Typical Memory Limit |
| --------------- | -------------------- |
| Chrome Desktop  | 4-8GB                |
| Chrome Mobile   | 1-2GB                |
| Firefox Desktop | 4-6GB                |
| Firefox Mobile  | 512MB-1GB            |
| Safari Desktop  | 4-6GB                |
| Safari Mobile   | 512MB-1GB            |

### 🚨 Common Issues and Solutions

#### 1. "Out of Memory" or Page Crashes

**Symptoms:**

-   Browser tab crashes
-   "Aw, Snap!" error in Chrome
-   Firefox becomes unresponsive
-   Memory indicator turns red

**Solutions:**

```bash
# Option 1: Use smaller ZIP files
# Split your BeReal export into smaller chunks

# Option 2: Reduce batch size (edit in browser console)
app.batchSize = 2;  // Default is 5
app.maxFileSize = 25;  // Default is 50MB per file

# Option 3: Enable garbage collection (Chrome with --enable-precise-memory-info flag)
# Start Chrome with: chrome --enable-precise-memory-info --js-flags="--expose-gc"
```

#### 2. Processing Stalls After "Python Environment Ready" / MemoryError

**Symptoms:**

-   Progress stuck at "Python environment ready!"
-   Python MemoryError in console
-   "Failed to compile Python code" errors
-   Memory usage keeps increasing

**Debugging Steps:**

1. **Check Browser Console:**

    ```javascript
    // Open DevTools (F12) and run:
    console.log("Files loaded:", app.files.size);
    console.log("Memory usage:", performance.memory);
    ```

2. **Enable Verbose Logging:**

    ```javascript
    // In browser console:
    app.log("Starting manual debug...");
    app.log(`Total files: ${app.files.size}`);
    for (const [name, file] of app.files.entries()) {
        if (file.size > 10 * 1024 * 1024) {
            // > 10MB
            app.log(
                `Large file: ${name} (${(file.size / 1024 / 1024).toFixed(
                    1
                )}MB)`
            );
        }
    }
    ```

3. **Test with Smaller Dataset:**
    ```javascript
    // Reduce files for testing
    const smallFiles = new Map();
    let count = 0;
    for (const [name, file] of app.files.entries()) {
        if (count < 20 || name.includes("posts.json")) {
            smallFiles.set(name, file);
            count++;
        }
    }
    app.files = smallFiles;
    ```

#### 3. ZIP Extraction Fails

**Symptoms:**

-   Error during ZIP extraction
-   "Failed to extract" messages
-   Incomplete file list

**Solutions:**

1. **Check ZIP File Integrity:**

    ```javascript
    // Test ZIP file in browser console
    fetch("your-file.zip")
        .then((r) => r.arrayBuffer())
        .then((buffer) => console.log("ZIP size:", buffer.byteLength));
    ```

2. **Reduce Extraction Batch Size:**
    ```javascript
    // In browser console before processing:
    app.batchSize = 3; // Smaller batches
    ```

### 🔧 Debug Configuration

#### Enable Maximum Debugging

Add this to your browser console before processing:

```javascript
// Enhanced debugging configuration
app.maxZipSize = 100; // Reduce from 200MB to 100MB
app.maxFileSize = 25; // Reduce from 50MB to 25MB
app.batchSize = 2; // Reduce from 5 to 2
app.memoryWarningThreshold = 300; // Lower warning threshold

// Enable all logging
app.debugMode = true;

console.log("Debug configuration applied");
```

#### Memory Monitoring

```javascript
// Monitor memory usage in real-time
function monitorMemory() {
    if (performance.memory) {
        const mem = performance.memory;
        console.log(
            `Memory: ${(mem.usedJSHeapSize / 1024 / 1024).toFixed(
                1
            )}MB used / ${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(
                1
            )}MB limit`
        );
    }
}

// Run every 5 seconds
setInterval(monitorMemory, 5000);
```

### 📝 Debugging Steps

1. **Check File Sizes:**

    ```bash
    # Before uploading, check your ZIP size
    ls -lh your-bereal-export.zip

    # Unzip and check contents
    unzip -l your-bereal-export.zip | head -20
    ```

2. **Use Browser Performance Tools:**

    - Open DevTools (F12)
    - Go to Performance tab
    - Record while processing
    - Look for memory spikes

3. **Enable Chrome Memory Flags:**

    ```bash
    # Start Chrome with memory debugging
    google-chrome --enable-precise-memory-info --js-flags="--expose-gc" --max-old-space-size=8192
    ```

4. **Gradual Testing:**

    ```javascript
    // Test with just posts.json first
    app.files.clear();
    // Re-upload just the posts.json file

    // Then add a few images
    // Then try the full dataset
    ```

5. **Force Streaming Mode:**

    ```javascript
    // Force streaming processing for large datasets
    forceStreamingMode();

    // Then try processing again
    // This will process files in smaller batches
    ```

6. **Check Memory Recommendations:**

    ```javascript
    // Get detailed memory analysis and recommendations
    debugFileExtraction();
    ```

### 🏥 Recovery Steps

If the page crashes or becomes unresponsive:

1. **Refresh the page** - This clears memory
2. **Close other tabs** - Free up browser memory
3. **Restart browser** - Complete memory reset
4. **Try smaller files** - Split your dataset

### 📊 Performance Benchmarks

Typical processing times:

| File Count | ZIP Size | Expected Time | Memory Usage |
| ---------- | -------- | ------------- | ------------ |
| 50 files   | 10MB     | 30 seconds    | 200MB        |
| 200 files  | 50MB     | 2 minutes     | 500MB        |
| 500 files  | 100MB    | 5 minutes     | 1GB          |
| 1000 files | 200MB    | 10+ minutes   | 2GB+         |

### 🔄 Alternative Approaches

If web version fails:

1. **Use Desktop Version:**

    ```bash
    # Clone repository
    git clone [repo-url]
    cd bereal-gdpr-photo-toolkit

    # Install dependencies
    poetry install

    # Run desktop version
    poetry run python process-photos.py
    ```

2. **Split Processing:**
    - Process in smaller batches
    - Use different browser
    - Use computer with more RAM

### 📞 Getting Help

When reporting issues, include:

1. **Browser and version**
2. **ZIP file size**
3. **Number of files**
4. **Error messages from console**
5. **Memory limits from console:**
    ```javascript
    console.log(performance.memory);
    ```

### 🎯 Best Practices

1. **Start Small:** Test with 10-20 files first
2. **Monitor Memory:** Watch the memory indicator
3. **Close Tabs:** Reduce browser memory usage
4. **Use Desktop:** For large datasets (>500 files)
5. **Regular Cleanup:** Refresh page between large processing jobs
