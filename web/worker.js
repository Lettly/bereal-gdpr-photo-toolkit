// Web Worker for BeReal processing
// This worker handles the heavy Python processing to avoid blocking the main thread

let pyodide = null;

// Import Pyodide in worker context
importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');

async function initializePyodide() {
    if (pyodide) {
        return pyodide;
    }

    postMessage({ type: 'log', message: 'Initializing Python environment in worker...', level: 'info' });
    postMessage({ type: 'progress', percentage: 10, message: 'Loading Python interpreter...' });

    try {
        pyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
        });

        postMessage({ type: 'progress', percentage: 30, message: 'Installing required packages...' });

        // Install required packages
        await pyodide.loadPackage(['micropip']);
        const micropip = pyodide.pyimport('micropip');

        // Install packages that are available in Pyodide
        await micropip.install(['Pillow', 'piexif']);

        postMessage({ type: 'progress', percentage: 50, message: 'Setting up processing environment...' });

        // Load our adapted Python script
        await loadPythonScript();

        postMessage({ type: 'log', message: 'Python environment ready in worker!', level: 'info' });
        return pyodide;
    } catch (error) {
        postMessage({ type: 'log', message: `Error initializing Python environment: ${error.message}`, level: 'error' });
        throw error;
    }
}

async function loadPythonScript() {
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
        """Send log message to main thread"""
        js.log_from_python(message, level)
    
    def update_progress(self, percentage, message):
        """Update progress bar"""
        js.update_progress_from_python(percentage, message)
    
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
        """Main processing function"""
        self.log("Starting file processing...")
        
        convert_to_jpeg = settings.get('convertToJpeg', True)
        keep_original_filename = settings.get('keepOriginalFilename', False)
        create_combined_images = settings.get('createCombinedImages', False)
        
        total_entries = len(posts_data)
        processed_entries = 0
        
        primary_images = []
        secondary_images = []
        
        for entry in posts_data:
            try:
                processed_entries += 1
                progress = 50 + (processed_entries / total_entries) * 40
                self.update_progress(progress, f"Processing entry {processed_entries}/{total_entries}")
                
                # Extract filenames
                primary_filename = Path(entry["primary"]["path"]).name
                secondary_filename = Path(entry["secondary"]["path"]).name
                
                # Check if files exist in uploaded data
                if primary_filename not in files_data or secondary_filename not in files_data:
                    self.log(f"Missing files for entry: {primary_filename} or {secondary_filename}", 'warning')
                    self.skipped_files_count += 1
                    continue
                
                # Parse metadata
                taken_at = datetime.strptime(entry["takenAt"], "%Y-%m-%dT%H:%M:%S.%fZ")
                location = entry.get("location")
                caption = entry.get("caption")
                
                # Process primary and secondary images
                for filename, role in [(primary_filename, "primary"), (secondary_filename, "secondary")]:
                    file_data = files_data[filename]
                    
                    # Skip if it's a video (limited support in browser)
                    if filename.lower().endswith('.mp4'):
                        self.log(f"Skipping video file: {filename} (limited browser support)")
                        self.skipped_files_count += 1
                        continue
                    
                    processed_data = file_data
                    converted = False
                    
                    # Convert to JPEG if requested
                    if convert_to_jpeg and filename.lower().endswith('.webp'):
                        converted_data, was_converted = self.convert_webp_to_jpg(file_data, filename)
                        if converted_data:
                            processed_data = converted_data
                            converted = was_converted
                            if converted:
                                self.converted_files_count += 1
                    
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
                    
                    # Store for potential combination
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
                
            except Exception as e:
                self.log(f"Error processing entry: {str(e)}", 'error')
                self.skipped_files_count += 1
        
        # Create combined images if requested
        if create_combined_images and len(primary_images) == len(secondary_images):
            self.update_progress(90, "Creating combined images...")
            
            for primary, secondary in zip(primary_images, secondary_images):
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

    await pyodide.runPython(pythonScript);
    postMessage({ type: 'log', message: 'Python processing script loaded in worker', level: 'info' });
}

// Handle messages from main thread
self.onmessage = async function (e) {
    const { type, data } = e.data;

    try {
        switch (type) {
            case 'init':
                await initializePyodide();
                postMessage({ type: 'init_complete' });
                break;

            case 'process':
                const { filesData, postsData, settings } = data;

                // Set up JavaScript functions that Python can call
                pyodide.globals.set('js', {
                    log_from_python: (message, level) => {
                        postMessage({ type: 'log', message, level });
                    },
                    update_progress_from_python: (percentage, message) => {
                        postMessage({ type: 'progress', percentage, message });
                    }
                });

                // Call Python processing function
                postMessage({ type: 'progress', percentage: 50, message: 'Starting file processing...' });

                const result = pyodide.runPython(`
processor.process_files(${JSON.stringify(filesData)}, ${JSON.stringify(postsData)}, ${JSON.stringify(settings)})
`);

                // Send results back to main thread
                const processedFiles = result.toJs().get('processed_files');
                const stats = result.toJs().get('stats');

                postMessage({
                    type: 'process_complete',
                    data: {
                        processedFiles: Object.fromEntries(processedFiles.entries()),
                        stats: Object.fromEntries(stats.entries())
                    }
                });
                break;

            default:
                postMessage({ type: 'error', message: `Unknown message type: ${type}` });
        }
    } catch (error) {
        postMessage({ type: 'error', message: error.message });
    }
};
