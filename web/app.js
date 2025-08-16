// BeReal GDPR Photo Toolkit Web App
class BeRealProcessor {
    constructor() {
        this.pyodide = null;
        this.files = new Map();
        this.processedFiles = new Map();
        this.isProcessing = false;
        this.debugMode = false;
        this.forceStreaming = false;
        this.memoryWarningThreshold = 500; // MB
        this.maxFileSize = 50; // MB per file
        this.maxZipSize = 200; // MB total ZIP size
        this.batchSize = 5; // Process files in smaller batches
        this.initializeEventListeners();
        this.startMemoryMonitoring();
        this.setupErrorHandling();
    }

    initializeEventListeners() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');

        // Drag and drop handlers
        uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        uploadArea.addEventListener('drop', this.handleDrop.bind(this));

        // File input handler
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));

        // Click to upload
        uploadArea.addEventListener('click', () => {
            if (!this.isProcessing) {
                fileInput.click();
            }
        });
    }

    setupErrorHandling() {
        // Global error handler
        window.addEventListener('error', (event) => {
            this.log(`Global error: ${event.error?.message || event.message}`, 'error');
            console.error('Global error:', event.error);
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.log(`Unhandled promise rejection: ${event.reason}`, 'error');
            console.error('Unhandled promise rejection:', event.reason);
        });
    }

    startMemoryMonitoring() {
        if (performance.memory) {
            setInterval(() => {
                const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
                const memTotal = performance.memory.totalJSHeapSize / 1024 / 1024;
                const memLimit = performance.memory.jsHeapSizeLimit / 1024 / 1024;

                if (memUsed > this.memoryWarningThreshold) {
                    this.log(`⚠️ High memory usage: ${memUsed.toFixed(1)}MB / ${memLimit.toFixed(1)}MB`, 'warning');
                }

                // Log detailed memory info if processing
                if (this.isProcessing) {
                    this.log(`Memory: ${memUsed.toFixed(1)}MB used, ${memTotal.toFixed(1)}MB allocated, ${memLimit.toFixed(1)}MB limit`);
                }
            }, 5000);
        } else {
            this.log('Memory monitoring not available in this browser', 'warning');
        }
    }

    forceGarbageCollection() {
        // Force garbage collection if available (Chrome dev tools)
        if (window.gc) {
            window.gc();
        }

        // NOTE: Do not prune files here; pruning was causing images to disappear
        // from this.files leading to empty batches. If needed, implement a safer
        // eviction strategy that never removes photo/video assets during processing.
    }

    handleDragOver(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        this.processUploadedFiles(files);
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.processUploadedFiles(files);
    }

    async processUploadedFiles(files) {
        this.log('Files selected: ' + files.map(f => f.name).join(', '));

        // Show upload progress section
        document.getElementById('uploadProgressSection').style.display = 'block';

        // Check total file size first
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const totalSizeMB = totalSize / 1024 / 1024;
        this.log(`Total upload size: ${totalSizeMB.toFixed(1)}MB`);

        if (totalSizeMB > this.maxZipSize * 2) {
            this.log(`⚠️ Very large upload (${totalSizeMB.toFixed(1)}MB). This may cause memory issues. Consider using the desktop version for files larger than ${this.maxZipSize}MB.`, 'warning');
        }

        // Read files with progress
        await this.readFilesWithProgress(files);

        // Filter for ZIP files and other relevant files
        const zipFiles = files.filter(f => f.name.toLowerCase().endsWith('.zip'));
        const otherFiles = files.filter(f => !f.name.toLowerCase().endsWith('.zip'));

        if (zipFiles.length === 0 && otherFiles.length === 0) {
            this.log('No valid files found. Please upload a ZIP file or individual media files.', 'error');
            return;
        }

        try {
            // Process ZIP files with memory management
            for (const zipFile of zipFiles) {
                const zipSizeMB = zipFile.size / 1024 / 1024;
                this.log(`Processing ZIP file: ${zipFile.name} (${zipSizeMB.toFixed(1)}MB)`);

                if (zipSizeMB > this.maxZipSize) {
                    this.log(`⚠️ Large ZIP file detected. This may take a while and use significant memory.`, 'warning');
                }

                await this.extractZipFile(zipFile);

                // Force garbage collection after each ZIP
                this.forceGarbageCollection();

                // Small delay to allow UI updates
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Process individual files
            for (const file of otherFiles) {
                this.files.set(file.name, file);
            }

            // Show memory usage
            if (performance.memory) {
                const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
                this.log(`Memory usage after upload: ${memUsed.toFixed(1)}MB`);
            }

            // Show settings section
            document.getElementById('settingsSection').style.display = 'block';
            this.log(`✅ Loaded ${this.files.size} files. Ready for processing.`);

        } catch (error) {
            this.log(`❌ Error processing uploads: ${error.message}`, 'error');
            console.error('Upload processing error:', error);
        }
    }

    async readFilesWithProgress(files) {
        let loaded = 0;
        const total = files.reduce((sum, file) => sum + file.size, 0);
        const uploadProgressFill = document.getElementById('uploadProgressFill');
        const uploadProgressText = document.getElementById('uploadProgressText');

        const updateUploadProgress = () => {
            const percentage = total > 0 ? Math.round((loaded / total) * 100) : 100;
            if (uploadProgressFill) uploadProgressFill.style.width = `${percentage}%`;
            if (uploadProgressText) uploadProgressText.textContent = `Reading files... ${percentage}%`;
        };

        // Initial progress update
        updateUploadProgress();

        const readFile = (file) => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    loaded += file.size;
                    updateUploadProgress();
                    resolve();
                };
                reader.onerror = reject;
                reader.onprogress = (event) => {
                    if (event.lengthComputable) {
                        // Update progress for current file being read
                        const currentFileProgress = event.loaded;
                        const tempLoaded = loaded + currentFileProgress;
                        const percentage = total > 0 ? Math.round((tempLoaded / total) * 100) : 100;
                        if (uploadProgressFill) uploadProgressFill.style.width = `${percentage}%`;
                        if (uploadProgressText) uploadProgressText.textContent = `Reading ${file.name}... ${percentage}%`;
                    }
                };
                reader.readAsArrayBuffer(file);
            });
        };

        for (const file of files) {
            await readFile(file);
        }

        if (uploadProgressText) uploadProgressText.textContent = 'File reading complete!';

        // Hide upload progress after a short delay
        setTimeout(() => {
            document.getElementById('uploadProgressSection').style.display = 'none';
        }, 1000);
    }

    async extractZipFile(zipFile) {
        try {
            const zipSizeMB = zipFile.size / 1024 / 1024;
            this.log(`Extracting ZIP file: ${zipFile.name} (${zipSizeMB.toFixed(1)}MB)`);

            // Show decompression progress section
            document.getElementById('decompressionProgressSection').style.display = 'block';
            this.updateDecompressionProgress(0, 'Initializing ZIP extraction...', 'Preparing to load ZIP file...');

            // Show progress for ZIP extraction
            this.updateProgress(5, 'Loading ZIP file...');

            // Use JSZip to extract the ZIP file with streaming for large files
            const JSZip = await this.loadJSZip();
            const zip = new JSZip();

            // Load ZIP with progress tracking
            this.updateProgress(10, 'Reading ZIP contents...');
            this.updateDecompressionProgress(10, 'Loading ZIP file...', `Reading ${zipFile.name}`);
            this.log(`📦 Loading ZIP file: ${zipFile.name}`);

            const zipContent = await zip.loadAsync(zipFile, {
                createFolders: false // Don't create folder entries to save memory
            });

            this.updateDecompressionProgress(20, 'ZIP file loaded', 'Analyzing file structure...');
            this.log(`📂 ZIP file loaded successfully`);

            // Count files first for progress tracking
            const fileEntries = Object.entries(zipContent.files).filter(([, file]) => !file.dir);
            const totalFiles = fileEntries.length;
            this.updateDecompressionProgress(25, 'File analysis complete', `Found ${totalFiles} files to extract`);
            this.log(`Found ${totalFiles} files in ZIP`);

            if (totalFiles > 1000) {
                this.log(`⚠️ Large number of files (${totalFiles}). This may take several minutes.`, 'warning');
            }

            let extractedCount = 0;
            const batchSize = Math.min(this.batchSize, 10); // Smaller batches for extraction

            // Process files in batches to prevent memory overflow
            for (let i = 0; i < fileEntries.length; i += batchSize) {
                const batch = fileEntries.slice(i, i + batchSize);
                const progress = 10 + (i / totalFiles) * 30; // 10-40% for extraction
                const decompressionProgress = 25 + (i / totalFiles) * 70; // 25-95% for decompression
                const currentBatch = Math.floor(i / batchSize) + 1;
                const totalBatches = Math.ceil(totalFiles / batchSize);

                this.updateProgress(progress, `Decompressing batch ${currentBatch}/${totalBatches} (${i + 1}-${Math.min(i + batchSize, totalFiles)} of ${totalFiles} files)`);
                this.updateDecompressionProgress(
                    decompressionProgress,
                    `Extracting batch ${currentBatch}/${totalBatches}`,
                    `Processing files ${i + 1}-${Math.min(i + batchSize, totalFiles)} of ${totalFiles}`
                );
                this.log(`🗂️ Processing batch ${currentBatch}/${totalBatches}: ${batch.length} files`);

                // Process batch with error handling
                await Promise.all(batch.map(async ([filename, file]) => {
                    try {
                        // Check file size before extraction
                        const fileSize = file._data ? file._data.uncompressedSize : 0;
                        const fileSizeMB = fileSize / 1024 / 1024;

                        if (fileSizeMB > this.maxFileSize) {
                            this.log(`⚠️ Skipping large file: ${filename} (${fileSizeMB.toFixed(1)}MB)`, 'warning');
                            return;
                        }

                        // Extract file with memory optimization and proper error handling
                        let arrayBuffer;
                        try {
                            arrayBuffer = await file.async('arraybuffer');
                        } catch (extractError) {
                            this.log(`Failed to extract ${filename}: ${extractError.message}`, 'warning');
                            return;
                        }

                        try {
                            const blob = new Blob([arrayBuffer], {
                                type: this.getContentType(filename)
                            });
                            const fileObj = new File([blob], filename, {
                                type: blob.type,
                                lastModified: file.date ? file.date.getTime() : Date.now()
                            });

                            this.files.set(filename, fileObj);
                            extractedCount++;

                        } finally {
                            // Always clear the array buffer reference to help GC
                            arrayBuffer = null;
                        }

                    } catch (fileError) {
                        this.log(`Failed to extract ${filename}: ${fileError.message}`, 'warning');
                        console.error(`Detailed error for ${filename}:`, fileError);
                    }
                }));

                // Memory management between batches
                this.forceGarbageCollection();

                // Show progress every batch
                this.log(`✅ Batch ${currentBatch}/${totalBatches} complete: ${extractedCount}/${totalFiles} files extracted`);

                // Show memory usage every 100 files
                if (extractedCount % 100 === 0 && performance.memory) {
                    const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
                    this.log(`📊 Memory usage: ${memUsed.toFixed(1)}MB (${extractedCount} files extracted)`);
                }

                // Small delay to prevent UI blocking
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            this.updateProgress(40, 'ZIP extraction complete');
            this.updateDecompressionProgress(100, 'Extraction complete!', `Successfully extracted ${extractedCount} files`);
            this.log(`✅ Extracted ${extractedCount} files from ${zipFile.name}`);

            // Final memory usage info
            if (performance.memory) {
                const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
                this.log(`Memory usage after extraction: ${memUsed.toFixed(1)}MB`);
            }

            // Hide decompression progress after a short delay
            setTimeout(() => {
                document.getElementById('decompressionProgressSection').style.display = 'none';
            }, 2000);

        } catch (error) {
            this.updateDecompressionProgress(0, 'Extraction failed', `Error: ${error.message}`);
            this.log(`❌ Error extracting ZIP file: ${error.message}`, 'error');
            console.error('ZIP extraction error:', error);

            // Hide decompression progress after error
            setTimeout(() => {
                document.getElementById('decompressionProgressSection').style.display = 'none';
            }, 3000);

            throw error;
        }
    }

    async loadJSZip() {
        if (window.JSZip) {
            return window.JSZip;
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = () => resolve(window.JSZip);
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async initializePyodide() {
        if (this.pyodide) {
            return this.pyodide;
        }

        this.log('Initializing Python environment...');
        this.updateProgress(45, 'Loading Python interpreter...');

        try {
            // Show memory before loading Pyodide
            if (performance.memory) {
                const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
                this.log(`Memory before Pyodide: ${memUsed.toFixed(1)}MB`);
            }

            this.pyodide = await loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/",
                stdout: (text) => this.log(`Python: ${text}`),
                stderr: (text) => this.log(`Python Error: ${text}`, 'error')
            });

            this.updateProgress(60, 'Installing required packages...');
            this.log('Pyodide loaded successfully');

            // Show memory after loading Pyodide
            if (performance.memory) {
                const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
                this.log(`Memory after Pyodide: ${memUsed.toFixed(1)}MB`);
            }

            // Install required packages with progress tracking
            await this.pyodide.loadPackage(['micropip']);
            this.log('Micropip loaded');

            const micropip = this.pyodide.pyimport('micropip');

            // Install packages that are available in Pyodide
            this.updateProgress(70, 'Installing Pillow...');
            await micropip.install(['Pillow']);
            this.log('Pillow installed');

            this.updateProgress(80, 'Installing piexif...');
            await micropip.install(['piexif']);
            this.log('piexif installed');

            this.updateProgress(90, 'Setting up processing environment...');

            // Load our adapted Python script
            await this.loadPythonScript();

            // Final memory check
            if (performance.memory) {
                const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
                this.log(`Memory after setup: ${memUsed.toFixed(1)}MB`);
            }

            this.log('✅ Python environment ready!');
            return this.pyodide;
        } catch (error) {
            this.log(`❌ Error initializing Python environment: ${error.message}`, 'error');
            console.error('Pyodide initialization error:', error);
            throw error;
        }
    }

    async loadPythonScript() {
        // Load the adapted Python script for browser environment
        const pythonScript = `
import json
from datetime import datetime
from PIL import Image, ImageDraw, ImageOps
import piexif
import io
import base64
from pathlib import Path

class BeRealProcessorWeb:
    def __init__(self):
        self.processed_files_count = 0
        self.converted_files_count = 0
        self.combined_files_count = 0
        self.skipped_files_count = 0
        self.processed_files = {}
        
    def log(self, message, level='info'):
        """Send log message to JavaScript"""
        try:
            import js
            if hasattr(js, 'log_from_python'):
                js.log_from_python(message, level)
            else:
                print(f"[{level.upper()}] {message}")
        except Exception as e:
            print(f"[{level.upper()}] {message} (logging error: {e})")
    
    def update_progress(self, percentage, message):
        """Update progress bar"""
        try:
            import js
            if hasattr(js, 'update_progress_from_python'):
                js.update_progress_from_python(percentage, message)
            else:
                print(f"Progress: {percentage}% - {message}")
        except Exception as e:
            print(f"Progress: {percentage}% - {message} (progress error: {e})")
    
    def convert_webp_to_jpg(self, image_data, filename):
        """Convert WebP image data to JPEG"""
        try:
            img = Image.open(io.BytesIO(image_data))
            if img.format == 'WEBP':
                # Convert to RGB if necessary
                if img.mode in ('RGBA', 'LA', 'P'):
                    img = img.convert('RGB')
                
                # Save as JPEG
                output = io.BytesIO()
                img.save(output, format='JPEG', quality=85)
                self.log(f"Converted {filename} from WebP to JPEG")
                return output.getvalue(), True
            else:
                return image_data, False
        except Exception as e:
            self.log(f"Error converting {filename}: {str(e)}", 'error')
            return None, False
    
    def _convert_to_degrees(self, value):
        """Convert decimal latitude/longitude to degrees, minutes, seconds"""
        d = int(value)
        m = int((value - d) * 60)
        s = (value - d - m / 60) * 3600.00
        
        d = (d, 1)
        m = (m, 1)
        s = (int(s * 100), 100)
        
        return (d, m, s)
    
    def update_exif(self, image_data, datetime_original, location=None, caption=None):
        """Update EXIF data for image"""
        try:
            # Load image and existing EXIF data
            img = Image.open(io.BytesIO(image_data))
            
            # Create or load EXIF data
            exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
            
            # Try to load existing EXIF data
            try:
                if hasattr(img, '_getexif') and img._getexif():
                    exif_dict = piexif.load(image_data)
            except:
                pass  # Use empty EXIF dict if loading fails
            
            # Ensure required directories exist
            if "0th" not in exif_dict:
                exif_dict["0th"] = {}
            if "Exif" not in exif_dict:
                exif_dict["Exif"] = {}
            
            # Update datetime
            datetime_str = datetime_original.strftime("%Y:%m:%d %H:%M:%S")
            exif_dict["Exif"][piexif.ExifIFD.DateTimeOriginal] = datetime_str
            exif_dict["0th"][piexif.ImageIFD.DateTime] = datetime_str
            
            # Update GPS information
            if location and "latitude" in location and "longitude" in location:
                gps_ifd = {
                    piexif.GPSIFD.GPSLatitudeRef: "N" if location["latitude"] >= 0 else "S",
                    piexif.GPSIFD.GPSLatitude: self._convert_to_degrees(abs(location["latitude"])),
                    piexif.GPSIFD.GPSLongitudeRef: "E" if location["longitude"] >= 0 else "W",
                    piexif.GPSIFD.GPSLongitude: self._convert_to_degrees(abs(location["longitude"])),
                }
                exif_dict["GPS"] = gps_ifd
                self.log(f"Added GPS coordinates: {location['latitude']}, {location['longitude']}")
            
            # Update caption
            if caption:
                exif_dict["0th"][piexif.ImageIFD.ImageDescription] = caption.encode('utf-8')
                self.log(f"Added caption: {caption}")
            
            # Save image with updated EXIF
            exif_bytes = piexif.dump(exif_dict)
            output = io.BytesIO()
            img.save(output, format='JPEG', exif=exif_bytes, quality=85)
            
            return output.getvalue()
            
        except Exception as e:
            self.log(f"Error updating EXIF data: {str(e)}", 'error')
            return image_data
    
    def combine_images_with_resizing(self, primary_data, secondary_data):
        """Combine primary and secondary images"""
        try:
            # Parameters for rounded corners and positioning
            corner_radius = 60
            outline_size = 7
            position = (55, 55)
            
            # Load images
            primary_image = Image.open(io.BytesIO(primary_data))
            secondary_image = Image.open(io.BytesIO(secondary_data))
            
            # Resize secondary image
            scaling_factor = 1 / 3.33333333
            width, height = secondary_image.size
            new_width = int(width * scaling_factor)
            new_height = int(height * scaling_factor)
            resized_secondary = secondary_image.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Ensure RGBA mode for transparency
            if resized_secondary.mode != "RGBA":
                resized_secondary = resized_secondary.convert("RGBA")
            
            # Create rounded corners mask
            mask = Image.new("L", (new_width, new_height), 0)
            draw = ImageDraw.Draw(mask)
            draw.rounded_rectangle((0, 0, new_width, new_height), corner_radius, fill=255)
            resized_secondary.putalpha(mask)
            
            # Create combined image
            combined_image = Image.new("RGB", primary_image.size)
            combined_image.paste(primary_image, (0, 0))
            
            # Draw outline
            outline_layer = Image.new("RGBA", combined_image.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(outline_layer)
            outline_box = [
                position[0] - outline_size,
                position[1] - outline_size,
                position[0] + new_width + outline_size,
                position[1] + new_height + outline_size,
            ]
            draw.rounded_rectangle(outline_box, corner_radius + outline_size, fill=(0, 0, 0, 255))
            combined_image.paste(outline_layer, (0, 0), outline_layer)
            
            # Paste secondary image
            combined_image.paste(resized_secondary, position, resized_secondary)
            
            # Save to bytes
            output = io.BytesIO()
            combined_image.save(output, format='JPEG', quality=85)
            return output.getvalue()
            
        except Exception as e:
            self.log(f"Error combining images: {str(e)}", 'error')
            return None
    
    def process_files(self, files_data, posts_data, settings):
        """Main processing function with optimized memory management"""
        self.log("Starting file processing...")
        
        convert_to_jpeg = settings.get('convertToJpeg', True)
        keep_original_filename = settings.get('keepOriginalFilename', False)
        create_combined_images = settings.get('createCombinedImages', False)
        
        total_entries = len(posts_data)
        processed_entries = 0
        
        # Use smaller batches for memory efficiency
        batch_size = 5
        primary_images = []
        secondary_images = []
        
        self.log(f"Processing {total_entries} entries in batches of {batch_size}")
        
        # Process entries in batches to manage memory
        for batch_start in range(0, total_entries, batch_size):
            batch_end = min(batch_start + batch_size, total_entries)
            batch_entries = posts_data[batch_start:batch_end]
            
            self.log(f"Processing batch {batch_start//batch_size + 1}/{(total_entries + batch_size - 1)//batch_size}")
            
            for entry in batch_entries:
                try:
                    processed_entries += 1
                    progress = 50 + (processed_entries / total_entries) * 40
                    self.update_progress(progress, f"Processing entry {processed_entries}/{total_entries}")
                    
                    # Extract filenames and full paths
                    primary_path = entry["primary"]["path"]
                    secondary_path = entry["secondary"]["path"]
                    primary_filename = Path(primary_path).name
                    secondary_filename = Path(secondary_path).name
                    
                    # Check if primary/secondary are videos based on mediaType
                    primary_is_video = entry["primary"].get("mediaType") == "video"
                    secondary_is_video = entry["secondary"].get("mediaType") == "video"
                    
                    # Check if files exist in uploaded data (try both full path and filename)
                    primary_key = None
                    secondary_key = None
                    
                    # Find primary file
                    if primary_path in files_data:
                        primary_key = primary_path
                    elif primary_filename in files_data:
                        primary_key = primary_filename
                    else:
                        # Try to find by filename in any path
                        for file_key in files_data.keys():
                            if file_key.endswith(primary_filename):
                                primary_key = file_key
                                break
                    
                    # Find secondary file
                    if secondary_path in files_data:
                        secondary_key = secondary_path
                    elif secondary_filename in files_data:
                        secondary_key = secondary_filename
                    else:
                        # Try to find by filename in any path
                        for file_key in files_data.keys():
                            if file_key.endswith(secondary_filename):
                                secondary_key = file_key
                                break
                    
                    if not primary_key or not secondary_key:
                        self.log(f"Missing files for entry: {primary_filename} or {secondary_filename}", 'warning')
                        self.log(f"Available files: {list(files_data.keys())[:5]}..." if len(files_data) > 5 else f"Available files: {list(files_data.keys())}")
                        self.skipped_files_count += 1
                        continue
                    
                    # Parse metadata
                    taken_at = datetime.strptime(entry["takenAt"], "%Y-%m-%dT%H:%M:%S.%fZ")
                    location = entry.get("location")
                    caption = entry.get("caption")
                    
                    # Handle BTS Media (MP4) if present
                    if "btsMedia" in entry:
                        bts_path = entry["btsMedia"]["path"]
                        bts_filename = Path(bts_path).name
                        
                        # Find BTS file in uploaded data
                        bts_key = None
                        if bts_path in files_data:
                            bts_key = bts_path
                        elif bts_filename in files_data:
                            bts_key = bts_filename
                        else:
                            # Try to find by filename in any path
                            for file_key in files_data.keys():
                                if file_key.endswith(bts_filename):
                                    bts_key = file_key
                                    break
                        
                        if bts_key:
                            bts_file_data = files_data[bts_key]
                            time_str = taken_at.strftime("%Y-%m-%dT%H-%M-%S")
                            
                            if keep_original_filename:
                                bts_output_filename = f"{time_str}_bts_{bts_filename}"
                            else:
                                bts_output_filename = f"{time_str}_bts.mp4"
                            
                            self.processed_files[bts_output_filename] = bts_file_data
                            self.processed_files_count += 1
                            self.log(f"Processed BTS Media: {bts_output_filename}")
                        else:
                            self.log(f"BTS media file not found: {bts_filename}", 'warning')
                            self.skipped_files_count += 1
                    
                    # Process primary and secondary media 
                    for file_key, filename, role, is_video in [(primary_key, primary_filename, "primary", primary_is_video), (secondary_key, secondary_filename, "secondary", secondary_is_video)]:
                        file_data = files_data[file_key]
                        
                        # Handle Videos - Process with metadata and audio handling
                        if is_video or filename.lower().endswith('.mp4'):
                            self.log(f"Handling video file: {filename} (mediaType: {'video' if is_video else 'inferred from extension'})")
                            
                            # Generate output filename  
                            time_str = taken_at.strftime("%Y-%m-%dT%H-%M-%S")
                            if keep_original_filename:
                                output_filename = f"{time_str}_{role}_{filename}"
                            else:
                                output_filename = f"{time_str}_{role}.mp4"
                            
                            # Store video with metadata for potential audio sync
                            video_info = {
                                'data': file_data,
                                'filename': output_filename,
                                'original_filename': filename,
                                'role': role,
                                'taken_at': taken_at,
                                'location': location,
                                'caption': caption
                            }
                            
                            self.processed_files[output_filename] = file_data
                            self.processed_files_count += 1
                            self.log(f"Processed video: {output_filename}")
                            
                            # Store for audio sync processing
                            if role == "primary":
                                primary_images.append({
                                    'path': output_filename,
                                    'taken_at': taken_at,
                                    'location': location,
                                    'caption': caption,
                                    'is_video': True,
                                    'video_info': video_info
                                })
                            else:
                                secondary_images.append({
                                    'path': output_filename,
                                    'is_video': True,
                                    'video_info': video_info,
                                    'taken_at': taken_at
                                })
                            continue

                        processed_data = file_data
                        converted = False
                        
                        try:
                            # Convert to JPEG if requested
                            if convert_to_jpeg and filename.lower().endswith('.webp'):
                                converted_data, was_converted = self.convert_webp_to_jpg(file_data, filename)
                                if converted_data:
                                    processed_data = converted_data
                                    converted = was_converted
                                    if converted:
                                        self.converted_files_count += 1
                                    # Original data is replaced, will be garbage collected
                            
                            # Update EXIF data
                            if convert_to_jpeg or filename.lower().endswith(('.jpg', '.jpeg')):
                                processed_data = self.update_exif(processed_data, taken_at, location, caption)
                            
                            # Generate output filename
                            time_str = taken_at.strftime("%Y-%m-%dT%H-%M-%S")
                            if keep_original_filename:
                                if converted:
                                    base_name = Path(filename).stem + '.jpg'
                                else:
                                    base_name = filename
                                output_filename = f"{time_str}_{role}_{base_name}"
                            else:
                                if converted or convert_to_jpeg:
                                    output_filename = f"{time_str}_{role}.jpg"
                                else:
                                    ext = Path(filename).suffix
                                    output_filename = f"{time_str}_{role}{ext}"
                            
                            # Store processed file
                            self.processed_files[output_filename] = processed_data
                            
                            # Store for potential combination (only if requested)
                            if create_combined_images:
                                if role == "primary":
                                    primary_images.append({
                                        'filename': output_filename,
                                        'data': processed_data,
                                        'taken_at': taken_at,
                                        'location': location,
                                        'caption': caption
                                    })
                                else:
                                    secondary_images.append({
                                        'filename': output_filename,
                                        'data': processed_data
                                    })
                            
                            self.processed_files_count += 1
                            self.log(f"Processed {role} image: {filename}")
                            
                        except Exception as file_error:
                            self.log(f"Error processing file {filename}: {str(file_error)}", 'error')
                            self.skipped_files_count += 1
                    
                except Exception as e:
                    self.log(f"Error processing entry: {str(e)}", 'error')
                    self.skipped_files_count += 1
            
            # Memory cleanup after each batch
            import gc
            gc.collect()
            self.log(f"Completed batch {batch_start//batch_size + 1}, memory cleanup performed")
        
        # Handle video audio synchronization
        self.log("Checking for video audio synchronization opportunities...")
        primary_videos = [img for img in primary_images if img.get('is_video', False)]
        secondary_videos = [img for img in secondary_images if img.get('is_video', False)]
        
        # Group videos by timestamp for audio sync
        video_pairs = {}
        for primary_video in primary_videos:
            timestamp = primary_video['taken_at'].isoformat()
            if timestamp not in video_pairs:
                video_pairs[timestamp] = {'primary': None, 'secondary': None}
            video_pairs[timestamp]['primary'] = primary_video
        
        for secondary_video in secondary_videos:
            timestamp = secondary_video['taken_at'].isoformat()  
            if timestamp in video_pairs:
                video_pairs[timestamp]['secondary'] = secondary_video
        
        # Process video pairs for potential audio sync
        for timestamp, pair in video_pairs.items():
            if pair['primary'] and pair['secondary']:
                primary_video = pair['primary']['video_info']
                secondary_video = pair['secondary']['video_info']
                self.log(f"Video pair found for audio sync: {primary_video['filename']} & {secondary_video['filename']}")
                
                # Note: In browser environment, we can't perform actual audio stream copying
                # but we can detect and log audio presence for user awareness
                self.log(f"Browser limitation: Audio sync between videos requires desktop processing")
                self.log(f"Videos preserved separately: {primary_video['filename']}, {secondary_video['filename']}")
        
        # Create combined images if requested (skip videos)
        if create_combined_images:
            self.update_progress(90, "Creating combined images...")
            image_primary = [img for img in primary_images if not img.get('is_video', False)]
            image_secondary = [img for img in secondary_images if not img.get('is_video', False)]
            
            if len(image_primary) == len(image_secondary):
                for primary, secondary in zip(image_primary, image_secondary):
                    try:
                        combined_data = self.combine_images_with_resizing(primary['data'], secondary['data'])
                        if combined_data:
                            # Update EXIF for combined image
                            combined_data = self.update_exif(
                                combined_data, 
                                primary['taken_at'], 
                                primary['location'], 
                                primary['caption']
                            )
                            
                            # Generate filename
                            time_str = primary['taken_at'].strftime("%Y-%m-%dT%H-%M-%S")
                            combined_filename = f"{time_str}_combined.jpg"
                            
                            self.processed_files[combined_filename] = combined_data
                            self.combined_files_count += 1
                            self.log(f"Created combined image: {combined_filename}")
                            
                    except Exception as e:
                        self.log(f"Error creating combined image: {str(e)}", 'error')
        
        self.update_progress(100, "Processing complete!")
        self.log(f"Processing finished. Processed: {self.processed_files_count}, Converted: {self.converted_files_count}, Combined: {self.combined_files_count}, Skipped: {self.skipped_files_count}")
        
        return {
            'processed_files': self.processed_files,
            'stats': {
                'processed': self.processed_files_count,
                'converted': self.converted_files_count,
                'combined': self.combined_files_count,
                'skipped': self.skipped_files_count
            }
        }

# Create global processor instance
processor = BeRealProcessorWeb()
`;

        await this.pyodide.runPython(pythonScript);
        this.log('Python processing script loaded');
    }

    log(message, level = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${level.toUpperCase()}] ${message}`);

        const logOutput = document.getElementById('logOutput');
        if (logOutput) {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry ${level}`;
            logEntry.textContent = `${timestamp} - ${message}`;
            logOutput.appendChild(logEntry);

            // Limit log entries to prevent memory issues
            const maxLogEntries = 1000;
            while (logOutput.children.length > maxLogEntries) {
                logOutput.removeChild(logOutput.firstChild);
            }

            logOutput.scrollTop = logOutput.scrollHeight;
        }

        // Enhanced debugging in debug mode
        if (this.debugMode && performance.memory) {
            const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
            if (memUsed > this.memoryWarningThreshold * 0.8) {
                console.warn(`High memory usage: ${memUsed.toFixed(1)}MB`);
            }
        }
    }

    updateProgress(percentage, message) {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');

        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }

        if (progressText) {
            progressText.textContent = message;
        }

        // Update memory indicator if available
        this.updateMemoryIndicator();
    }

    updateMemoryIndicator() {
        const memoryIndicator = document.getElementById('memoryIndicator');
        const memoryUsage = document.getElementById('memoryUsage');
        const memoryLimit = document.getElementById('memoryLimit');

        if (performance.memory && memoryIndicator && memoryUsage && memoryLimit) {
            const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
            const memLimit = performance.memory.jsHeapSizeLimit / 1024 / 1024;

            memoryUsage.textContent = `${memUsed.toFixed(1)}MB`;
            memoryLimit.textContent = `${memLimit.toFixed(1)}MB`;

            // Show memory indicator
            memoryIndicator.style.display = 'block';

            // Update styling based on usage
            memoryIndicator.className = 'memory-indicator';
            if (memUsed > memLimit * 0.8) {
                memoryIndicator.classList.add('danger');
            } else if (memUsed > memLimit * 0.6) {
                memoryIndicator.classList.add('warning');
            }
        }
    }

    updateDecompressionProgress(percentage, message, details) {
        const progressFill = document.getElementById('decompressionProgressFill');
        const progressText = document.getElementById('decompressionProgressText');
        const progressDetails = document.getElementById('decompressionProgressDetails');

        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }

        if (progressText) {
            progressText.textContent = message;
        }

        if (progressDetails && details) {
            progressDetails.innerHTML = `<small>${details}</small>`;
        }
    }

    async startProcessing() {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;

        // Show progress section
        document.getElementById('progressSection').style.display = 'block';
        document.getElementById('resultsSection').style.display = 'none';

        // Disable process button
        const processBtn = document.getElementById('processBtn');
        processBtn.disabled = true;
        processBtn.innerHTML = '<div class="loading"></div>Processing...';

        try {
            // Clear any previous logs specific to processing
            this.log('=== Starting BeReal Processing ===');

            // Check memory before starting
            if (performance.memory) {
                const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
                const memLimit = performance.memory.jsHeapSizeLimit / 1024 / 1024;
                this.log(`Initial memory: ${memUsed.toFixed(1)}MB / ${memLimit.toFixed(1)}MB available`);

                if (memUsed > memLimit * 0.7) {
                    this.log(`⚠️ High memory usage detected. Consider refreshing the page or using smaller files.`, 'warning');
                }
            }

            // Initialize Pyodide with detailed logging
            this.log('Initializing Python environment...');
            await this.initializePyodide();

            // Get settings
            const settings = {
                convertToJpeg: document.getElementById('convertToJpeg').checked,
                keepOriginalFilename: document.getElementById('keepOriginalFilename').checked,
                createCombinedImages: document.getElementById('createCombinedImages').checked
            };
            this.log(`Settings: ${JSON.stringify(settings)}`);

            // Find posts.json file
            this.log('Looking for posts.json file...');
            let postsData = null;
            let postsFilename = null;

            for (const [filename, file] of this.files.entries()) {
                if (filename.toLowerCase().includes('posts.json') || filename === 'posts.json') {
                    this.log(`Found posts file: ${filename}`);
                    try {
                        const text = await file.text();
                        postsData = JSON.parse(text);
                        postsFilename = filename;
                        this.log(`Loaded ${postsData.length} posts from ${filename}`);
                        break;
                    } catch (parseError) {
                        this.log(`Error parsing ${filename}: ${parseError.message}`, 'error');
                    }
                }
            }

            if (!postsData) {
                throw new Error('posts.json file not found. Please ensure your BeReal export contains the posts.json file.');
            }

            // Check if we have too much data for direct processing
            const totalFiles = this.files.size - 1; // Exclude posts.json
            let totalDataSize = 0;

            for (const [filename, file] of this.files.entries()) {
                if (!filename.toLowerCase().includes('posts.json')) {
                    totalDataSize += file.size;
                }
            }

            const totalDataSizeMB = totalDataSize / 1024 / 1024;
            this.log(`Total data size: ${totalDataSizeMB.toFixed(1)}MB across ${totalFiles} files`);

            // Determine processing method based on data size and available memory
            let useStreaming = false;
            let reason = '';

            // More aggressive streaming triggers to prevent MemoryError
            if (performance.memory) {
                const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
                const memLimit = performance.memory.jsHeapSizeLimit / 1024 / 1024;
                const memAvailable = memLimit - memUsed;

                this.log(`Memory analysis: Used=${memUsed.toFixed(1)}MB, Available=${memAvailable.toFixed(1)}MB, Limit=${memLimit.toFixed(1)}MB`);

                // Use streaming if data size is more than 30% of available memory (reduced from 50%)
                if (totalDataSizeMB > memAvailable * 0.3) {
                    useStreaming = true;
                    reason = `data size (${totalDataSizeMB.toFixed(1)}MB) exceeds 30% of available memory (${memAvailable.toFixed(1)}MB)`;
                }

                // Also use streaming if we're already using more than 60% of total memory
                if (memUsed > memLimit * 0.6) {
                    useStreaming = true;
                    reason = `high memory usage (${memUsed.toFixed(1)}MB / ${memLimit.toFixed(1)}MB = ${((memUsed / memLimit) * 100).toFixed(1)}%)`;
                }
            }

            // Use streaming for smaller datasets too (reduced thresholds)
            if (totalDataSizeMB > 50 || totalFiles > 100) {
                useStreaming = true;
                reason = `dataset size (${totalDataSizeMB.toFixed(1)}MB, ${totalFiles} files) exceeds safe limits`;
            }

            // Check if streaming mode is forced
            if (this.forceStreaming) {
                useStreaming = true;
                reason = 'streaming mode forced by user';
                this.forceStreaming = false; // Reset flag
            }

            // ALWAYS use streaming if we have more than 50 files to be extra safe
            if (totalFiles > 50) {
                useStreaming = true;
                if (!reason) reason = `file count (${totalFiles}) requires streaming processing`;
            }

            if (useStreaming) {
                this.log(`⚠️ Using streaming processing: ${reason}`, 'warning');
                await this.processFilesInStreams(postsData, settings);
                return;
            }

            // For smaller datasets, use direct processing
            this.updateProgress(92, 'Preparing files for processing...');
            this.log('Converting files to Python format...');

            const filesData = {};
            let fileCount = 0;

            for (const [filename, file] of this.files.entries()) {
                if (!filename.toLowerCase().includes('posts.json')) {
                    try {
                        const arrayBuffer = await file.arrayBuffer();
                        filesData[filename] = new Uint8Array(arrayBuffer);
                        fileCount++;

                        // Show progress every 25 files for smaller batches
                        if (fileCount % 25 === 0) {
                            this.log(`Converted ${fileCount}/${totalFiles} files to Python format`);
                            // Small delay to allow UI updates
                            await new Promise(resolve => setTimeout(resolve, 1));
                        }
                    } catch (fileError) {
                        this.log(`Error converting file ${filename}: ${fileError.message}`, 'warning');
                    }
                }
            }

            this.log(`✅ Converted ${fileCount} files to Python format`);

            // Memory check before processing
            if (performance.memory) {
                const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
                this.log(`Memory before processing: ${memUsed.toFixed(1)}MB`);

                if (memUsed > this.memoryWarningThreshold) {
                    this.log(`⚠️ High memory usage (${memUsed.toFixed(1)}MB). Processing may be slow or fail.`, 'warning');
                }
            }

            // Set up JavaScript functions that Python can call
            this.pyodide.globals.set('js', {
                log_from_python: (message, level) => this.log(`🐍 ${message}`, level),
                update_progress_from_python: (percentage, message) => this.updateProgress(percentage, message)
            });

            // Call Python processing function with error handling
            this.updateProgress(95, 'Starting Python processing...');
            this.log('Calling Python processing function...');

            // Convert settings to Python format
            const pythonSettings = {
                convertToJpeg: settings.convertToJpeg ? 'True' : 'False',
                keepOriginalFilename: settings.keepOriginalFilename ? 'True' : 'False',
                createCombinedImages: settings.createCombinedImages ? 'True' : 'False'
            };

            // Pass data to Python using pyodide.globals instead of JSON strings
            this.pyodide.globals.set('files_data_js', filesData);
            this.pyodide.globals.set('posts_data_js', postsData);

            let result;
            try {
                result = this.pyodide.runPython(`
# Convert files data to proper format
import js

files_data_converted = {}
for filename in files_data_js.object_keys():
    file_data = getattr(files_data_js, filename)
    if file_data:
        # Convert Uint8Array to bytes
        files_data_converted[filename] = bytes(file_data.to_py())

posts_data_converted = posts_data_js.to_py()

settings_converted = {
    'convertToJpeg': ${pythonSettings.convertToJpeg},
    'keepOriginalFilename': ${pythonSettings.keepOriginalFilename},
    'createCombinedImages': ${pythonSettings.createCombinedImages}
}

processor.process_files(files_data_converted, posts_data_converted, settings_converted)
`);
            } catch (pythonError) {
                this.log(`Python processing error: ${pythonError.message}`, 'error');

                // If we get a MemoryError and we're not already using streaming, try streaming
                if (pythonError.message.includes('MemoryError') && !useStreaming) {
                    this.log(`🔄 MemoryError detected! Automatically switching to streaming processing...`, 'warning');
                    try {
                        await this.processFilesInStreams(postsData, settings);
                        return; // Exit successfully if streaming works
                    } catch (streamingError) {
                        this.log(`❌ Streaming processing also failed: ${streamingError.message}`, 'error');
                        throw new Error(`Both direct and streaming processing failed. Dataset may be too large for browser processing.`);
                    }
                }

                throw new Error(`Python processing failed: ${pythonError.message}`);
            }

            // Get results with error handling
            this.log('Processing Python results...');
            let processedFiles, stats;

            try {
                processedFiles = result.toJs().get('processed_files');
                stats = result.toJs().get('stats');
                this.log(`Python returned ${processedFiles.size} processed files`);
            } catch (resultError) {
                this.log(`Error extracting Python results: ${resultError.message}`, 'error');
                throw new Error(`Failed to extract processing results: ${resultError.message}`);
            }

            // Convert processed files back to downloadable format
            this.log('Converting processed files to downloadable format...');
            this.processedFiles.clear();

            let convertedCount = 0;
            for (const [filename, data] of processedFiles.entries()) {
                try {
                    const blob = new Blob([data], { type: this.getContentType(filename) });
                    this.processedFiles.set(filename, blob);
                    convertedCount++;

                    if (convertedCount % 25 === 0) {
                        this.log(`Converted ${convertedCount} processed files to blobs`);
                    }
                } catch (blobError) {
                    this.log(`Error creating blob for ${filename}: ${blobError.message}`, 'warning');
                }
            }

            this.log(`✅ Converted ${convertedCount} processed files to downloadable format`);

            // Final memory check
            if (performance.memory) {
                const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
                this.log(`Final memory usage: ${memUsed.toFixed(1)}MB`);
            }

            // Show results
            this.showResults(stats);
            this.log('=== Processing Complete ===');

        } catch (error) {
            this.log(`❌ Processing failed: ${error.message}`, 'error');
            this.log(`Error stack: ${error.stack}`, 'error');
            this.updateProgress(0, 'Processing failed');

            // Try to free up memory
            this.forceGarbageCollection();

        } finally {
            this.isProcessing = false;
            processBtn.disabled = false;
            processBtn.innerHTML = 'Start Processing';
        }
    }

    async processFilesInStreams(postsData, settings) {
        this.log('🔄 Starting streaming processing for large dataset...');

        try {
            // Set up JavaScript functions that Python can call
            this.pyodide.globals.set('js', {
                log_from_python: (message, level) => this.log(`🐍 ${message}`, level),
                update_progress_from_python: (percentage, message) => this.updateProgress(percentage, message)
            });

            // Initialize the Python processor with settings
            this.updateProgress(95, 'Initializing streaming processor...');

            // Convert JavaScript booleans to Python booleans
            const pythonSettings = {
                convertToJpeg: settings.convertToJpeg ? 'True' : 'False',
                keepOriginalFilename: settings.keepOriginalFilename ? 'True' : 'False',
                createCombinedImages: settings.createCombinedImages ? 'True' : 'False'
            };

            const initResult = this.pyodide.runPython(`
# Initialize streaming processor
streaming_processor = BeRealProcessorWeb()
streaming_processor.log("Streaming processor initialized")

# Store settings with proper Python booleans
streaming_settings = {
    'convertToJpeg': ${pythonSettings.convertToJpeg},
    'keepOriginalFilename': ${pythonSettings.keepOriginalFilename},
    'createCombinedImages': ${pythonSettings.createCombinedImages}
}
streaming_processor.log(f"Settings: {streaming_settings}")

"initialized"
`);

            this.log('Python streaming processor initialized');

            // Process posts in very small batches to prevent memory issues
            const batchSize = 5; // Process 5 posts at a time (reduced from 10)
            const totalPosts = postsData.length;
            let processedPosts = 0;

            this.processedFiles.clear();

            for (let i = 0; i < totalPosts; i += batchSize) {
                const batchEnd = Math.min(i + batchSize, totalPosts);
                const postsBatch = postsData.slice(i, batchEnd);

                this.log(`Processing posts batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalPosts / batchSize)} (posts ${i + 1}-${batchEnd})`);
                this.updateProgress(95 + (i / totalPosts) * 5, `Processing posts ${i + 1}-${batchEnd} of ${totalPosts}`);

                // Process this batch of posts
                await this.processBatchStreaming(postsBatch, settings);

                processedPosts += postsBatch.length;

                // Force garbage collection between batches
                this.forceGarbageCollection();

                // Small delay to allow UI updates
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Get final results from Python
            const finalStats = this.pyodide.runPython(`
{
    'processed': streaming_processor.processed_files_count,
    'converted': streaming_processor.converted_files_count,
    'combined': streaming_processor.combined_files_count,
    'skipped': streaming_processor.skipped_files_count
}
`);

            this.log(`✅ Streaming processing complete. Processed ${processedPosts} posts.`);

            // Show results
            this.showResults(finalStats.toJs());

        } catch (error) {
            this.log(`❌ Streaming processing failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async processBatchStreaming(postsBatch, settings) {
        try {
            // Collect files needed for this batch
            let batchFiles = {};
            const neededFiles = new Set();

            // Identify which files we need for this batch
            for (const post of postsBatch) {
                const primaryPath = post.primary?.path;
                const secondaryPath = post.secondary?.path;
                const btsPath = post.btsMedia?.path;

                if (primaryPath) neededFiles.add(primaryPath);
                if (secondaryPath) neededFiles.add(secondaryPath);
                if (btsPath) neededFiles.add(btsPath);
            }

            this.log(`Loading ${neededFiles.size} files for batch processing...`);

            // Load only the files we need for this batch
            for (const filePath of neededFiles) {
                let foundFile = null;
                let foundKey = null;

                // Normalize the path (remove leading slash if present)
                const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;

                // Try multiple strategies to find the file
                const searchPaths = [
                    filePath,           // Original path
                    normalizedPath,     // Without leading slash
                    filePath.substring(1) // Remove first character if it's a slash
                ];

                // Try exact path matches first
                for (const searchPath of searchPaths) {
                    if (this.files.has(searchPath)) {
                        foundFile = this.files.get(searchPath);
                        foundKey = searchPath;
                        break;
                    }
                }

                // If not found, try filename matching
                if (!foundFile) {
                    const filename = filePath.split('/').pop();
                    for (const [key, file] of this.files.entries()) {
                        if (key.endsWith(filename)) {
                            foundFile = file;
                            foundKey = key;
                            break;
                        }
                    }
                }

                if (foundFile) {
                    try {
                        const arrayBuffer = await foundFile.arrayBuffer();
                        batchFiles[foundKey] = new Uint8Array(arrayBuffer);
                    } catch (fileError) {
                        this.log(`Error loading file ${filePath}: ${fileError.message}`, 'warning');
                    }
                } else {
                    this.log(`File not found: ${filePath}`, 'warning');
                }
            }

            // Process this batch in Python with error handling
            let batchResult;
            try {
                // Pass data to Python using pyodide.globals
                this.pyodide.globals.set('batch_files_js', batchFiles);
                this.pyodide.globals.set('batch_posts_js', postsBatch);

                batchResult = this.pyodide.runPython(`
# Process batch with streaming processor
import js

# Convert JavaScript objects to Python
batch_files_data = {}
for filename in batch_files_js.object_keys():
    file_data = getattr(batch_files_js, filename)
    if file_data:
        # Convert Uint8Array to bytes
        batch_files_data[filename] = bytes(file_data.to_py())

batch_posts_data = batch_posts_js.to_py()

batch_result = streaming_processor.process_files(batch_files_data, batch_posts_data, streaming_settings)

# Get processed files from this batch
batch_processed_files = batch_result.get('processed_files', {})
batch_processed_files
`);
            } catch (pythonError) {
                if (pythonError.message.includes('MemoryError')) {
                    this.log(`⚠️ Memory error in batch processing, trying individual files...`, 'warning');
                    // Process files one by one if batch fails
                    batchResult = await this.processFilesIndividually(postsBatch, batchFiles, settings);
                } else {
                    throw pythonError;
                }
            }

            // Convert results back to downloadable format
            const processedFiles = batchResult.toJs();
            for (const [filename, data] of processedFiles.entries()) {
                try {
                    const blob = new Blob([data], { type: this.getContentType(filename) });
                    this.processedFiles.set(filename, blob);
                } catch (blobError) {
                    this.log(`Error creating blob for ${filename}: ${blobError.message}`, 'warning');
                }
            }

            this.log(`✅ Batch processed: ${processedFiles.size} files generated`);

            // Clear batch data to free memory
            batchFiles = null;

        } catch (error) {
            this.log(`Error processing batch: ${error.message}`, 'error');
            throw error;
        }
    }

    async processFilesIndividually(postsBatch, batchFiles, settings) {
        this.log(`🔄 Processing ${postsBatch.length} posts individually due to memory constraints...`);

        const individualResults = new Map();

        for (let i = 0; i < postsBatch.length; i++) {
            const post = postsBatch[i];
            this.log(`Processing individual post ${i + 1}/${postsBatch.length}...`);

            try {
                // Get files for this single post
                const postFiles = {};
                const primaryPath = post.primary?.path;
                const secondaryPath = post.secondary?.path;

                // Find primary file
                if (primaryPath) {
                    let foundKey = null;
                    if (batchFiles[primaryPath]) {
                        foundKey = primaryPath;
                    } else {
                        // Try to find by filename
                        const filename = primaryPath.split('/').pop();
                        for (const key of Object.keys(batchFiles)) {
                            if (key.endsWith(filename)) {
                                foundKey = key;
                                break;
                            }
                        }
                    }
                    if (foundKey) {
                        postFiles[foundKey] = batchFiles[foundKey];
                    }
                }

                // Find secondary file
                if (secondaryPath) {
                    let foundKey = null;
                    if (batchFiles[secondaryPath]) {
                        foundKey = secondaryPath;
                    } else {
                        // Try to find by filename
                        const filename = secondaryPath.split('/').pop();
                        for (const key of Object.keys(batchFiles)) {
                            if (key.endsWith(filename)) {
                                foundKey = key;
                                break;
                            }
                        }
                    }
                    if (foundKey) {
                        postFiles[foundKey] = batchFiles[foundKey];
                    }
                }

                // Process this single post
                this.pyodide.globals.set('post_files_js', postFiles);
                this.pyodide.globals.set('single_post_js', [post]);

                const singleResult = this.pyodide.runPython(`
# Process single post
import js

# Convert JavaScript objects to Python
single_files_data = {}
for filename in post_files_js.object_keys():
    file_data = getattr(post_files_js, filename)
    if file_data:
        # Convert Uint8Array to bytes
        single_files_data[filename] = bytes(file_data.to_py())

single_post_data = single_post_js.to_py()

single_result = streaming_processor.process_files(single_files_data, single_post_data, streaming_settings)
single_processed_files = single_result.get('processed_files', {})
single_processed_files
`);

                // Merge results
                const processedFiles = singleResult.toJs();
                for (const [filename, data] of processedFiles.entries()) {
                    individualResults.set(filename, data);
                }

                // Force garbage collection after each file
                this.forceGarbageCollection();

            } catch (singleError) {
                this.log(`Error processing individual post: ${singleError.message}`, 'warning');
            }
        }

        this.log(`✅ Individual processing complete: ${individualResults.size} files generated`);
        return { toJs: () => individualResults };
    }

    getContentType(filename) {
        const ext = filename.toLowerCase().split('.').pop();
        const types = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'webp': 'image/webp',
            'mp4': 'video/mp4'
        };
        return types[ext] || 'application/octet-stream';
    }

    async detectVideoAudio(videoBlob, filename) {
        return new Promise((resolve) => {
            try {
                const video = document.createElement('video');
                video.muted = true;
                video.preload = 'metadata';

                video.onloadedmetadata = () => {
                    // Check if video has audio track
                    const hasAudio = video.audioTracks && video.audioTracks.length > 0;
                    this.log(`Audio detection for ${filename}: ${hasAudio ? 'Has audio' : 'No audio'}`);
                    URL.revokeObjectURL(video.src);
                    resolve(hasAudio);
                };

                video.onerror = () => {
                    this.log(`Unable to detect audio for ${filename}`, 'warning');
                    URL.revokeObjectURL(video.src);
                    resolve(false);
                };

                // Set timeout to avoid hanging
                setTimeout(() => {
                    if (video.src) {
                        URL.revokeObjectURL(video.src);
                        resolve(false);
                    }
                }, 5000);

                video.src = URL.createObjectURL(videoBlob);
            } catch (error) {
                this.log(`Error detecting audio for ${filename}: ${error.message}`, 'warning');
                resolve(false);
            }
        });
    }

    showResults(stats) {
        const resultsSection = document.getElementById('resultsSection');
        const resultsSummary = document.getElementById('resultsSummary');

        resultsSummary.innerHTML = `
            <h3>✅ Processing Complete!</h3>
            <div class="results-stats">
                <div class="stat-item">
                    <div class="stat-number">${stats.get('processed')}</div>
                    <div class="stat-label">Files Processed</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${stats.get('converted')}</div>
                    <div class="stat-label">Files Converted</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${stats.get('combined')}</div>
                    <div class="stat-label">Images Combined</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${stats.get('skipped')}</div>
                    <div class="stat-label">Files Skipped</div>
                </div>
            </div>
        `;

        resultsSection.style.display = 'block';
        this.log('Results displayed. Ready for download.');
    }

    async downloadResults() {
        if (this.processedFiles.size === 0) {
            this.log('No processed files to download', 'warning');
            return;
        }

        try {
            // Create ZIP file with processed results
            const JSZip = await this.loadJSZip();
            const zip = new JSZip();

            // Add all processed files to ZIP
            for (const [filename, blob] of this.processedFiles.entries()) {
                zip.file(filename, blob);
            }

            // Generate and download ZIP
            this.log('Creating download archive...');
            const zipBlob = await zip.generateAsync({ type: 'blob' });

            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bereal-processed-${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.log('Download started!');
        } catch (error) {
            this.log(`Download failed: ${error.message}`, 'error');
        }
    }
}

// Initialize the application
const app = new BeRealProcessor();

// Global functions for HTML onclick handlers
function startProcessing() {
    app.startProcessing();
}

function downloadResults() {
    app.downloadResults();
}

function toggleDebugMode() {
    app.debugMode = !app.debugMode;
    const body = document.body;
    if (app.debugMode) {
        body.classList.add('debug-mode');
        app.log('🔧 Debug mode enabled', 'info');
        app.log(`Current settings: batchSize=${app.batchSize}, maxFileSize=${app.maxFileSize}MB, maxZipSize=${app.maxZipSize}MB`);
    } else {
        body.classList.remove('debug-mode');
        app.log('🔧 Debug mode disabled', 'info');
    }
}

function clearLogs() {
    const logOutput = document.getElementById('logOutput');
    if (logOutput) {
        logOutput.innerHTML = '';
        console.clear();
    }
    app.log('🗑️ Logs cleared');
}

function showSystemInfo() {
    app.log('=== System Information ===');
    app.log(`Browser: ${navigator.userAgent}`);
    app.log(`Platform: ${navigator.platform}`);
    app.log(`Language: ${navigator.language}`);
    app.log(`Online: ${navigator.onLine}`);
    app.log(`Cookies enabled: ${navigator.cookieEnabled}`);

    if (performance.memory) {
        const mem = performance.memory;
        app.log(`Memory - Used: ${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB, Total: ${(mem.totalJSHeapSize / 1024 / 1024).toFixed(1)}MB, Limit: ${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB`);
    } else {
        app.log('Memory API not available');
    }

    app.log(`Files loaded: ${app.files.size}`);
    app.log(`Processed files: ${app.processedFiles.size}`);
    app.log(`Processing: ${app.isProcessing}`);

    // Browser feature detection
    app.log(`WebAssembly: ${typeof WebAssembly !== 'undefined' ? '✅' : '❌'}`);
    app.log(`File API: ${(window.File && window.FileReader && window.FileList && window.Blob) ? '✅' : '❌'}`);
    app.log(`Web Workers: ${typeof Worker !== 'undefined' ? '✅' : '❌'}`);
    app.log(`IndexedDB: ${window.indexedDB ? '✅' : '❌'}`);
    app.log('========================');
}

function forceGC() {
    app.log('🧹 Forcing garbage collection...');
    app.forceGarbageCollection();

    if (performance.memory) {
        const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
        app.log(`Memory after cleanup: ${memUsed.toFixed(1)}MB`);
    }

    app.log('✅ Cleanup completed');
}

function debugFileExtraction() {
    app.log('=== File Extraction Debug ===');
    app.log(`Total files loaded: ${app.files.size}`);

    let totalSize = 0;
    let largeFiles = 0;
    let fileTypes = {};

    for (const [filename, file] of app.files.entries()) {
        totalSize += file.size;
        const sizeMB = file.size / 1024 / 1024;

        if (sizeMB > 10) {
            largeFiles++;
            app.log(`Large file: ${filename} (${sizeMB.toFixed(1)}MB)`);
        }

        const ext = filename.split('.').pop()?.toLowerCase() || 'unknown';
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    }

    const totalSizeMB = totalSize / 1024 / 1024;
    app.log(`Total size: ${totalSizeMB.toFixed(1)}MB`);
    app.log(`Large files (>10MB): ${largeFiles}`);
    app.log(`File types: ${JSON.stringify(fileTypes, null, 2)}`);

    // Memory analysis
    if (performance.memory) {
        const memUsed = performance.memory.usedJSHeapSize / 1024 / 1024;
        const memLimit = performance.memory.jsHeapSizeLimit / 1024 / 1024;
        const memAvailable = memLimit - memUsed;

        app.log(`Memory - Used: ${memUsed.toFixed(1)}MB, Available: ${memAvailable.toFixed(1)}MB, Limit: ${memLimit.toFixed(1)}MB`);

        if (totalSizeMB > memAvailable * 0.5) {
            app.log(`⚠️ Recommendation: Use streaming processing (data > 50% of available memory)`, 'warning');
        } else {
            app.log(`✅ Direct processing should work fine`);
        }
    }

    app.log('============================');
}

function forceStreamingMode() {
    app.log('🔄 Forcing streaming mode for next processing...');
    app.forceStreaming = true;
    app.log('Streaming mode will be used regardless of file size');
}

function enableAggressiveStreaming() {
    app.log('🚨 Enabling aggressive streaming mode...');
    // Reduce all thresholds to force streaming for almost any dataset
    app.maxFileSize = 10; // Reduce from 50MB to 10MB
    app.maxZipSize = 25;  // Reduce from 200MB to 25MB
    app.batchSize = 2;    // Reduce from 5 to 2
    app.forceStreaming = true;
    app.log('Aggressive streaming enabled: maxFileSize=10MB, maxZipSize=25MB, batchSize=2');
}

// Add to global scope for console access
window.debugFileExtraction = debugFileExtraction;
window.forceStreamingMode = forceStreamingMode;
window.enableAggressiveStreaming = enableAggressiveStreaming;

// Log function for debugging
window.beRealApp = app;
