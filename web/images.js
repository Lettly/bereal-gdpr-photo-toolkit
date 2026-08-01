// Image processing: WebP -> JPEG conversion, EXIF/IPTC metadata, combined images.
// Mirrors the behaviour of process-photos.py using browser APIs and piexifjs.

const SOURCE_APP = "BeReal app";
const PROCESSING_TOOL = "github/bereal-gdpr-photo-toolkit";

// piexifjs is loaded globally via <script> as `piexif`.
const piexif = window.piexif;

/**
 * Decode an image Blob into an ImageBitmap (handles WebP, JPEG, PNG).
 */
async function decodeImage(blob) {
    if ("createImageBitmap" in window) {
        return await createImageBitmap(blob);
    }
    // Fallback via <img>
    const url = URL.createObjectURL(blob);
    try {
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
        });
        return img;
    } finally {
        URL.revokeObjectURL(url);
    }
}

function drawToCanvas(source, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0, width, height);
    return canvas;
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Convert a WebP (or any decodable) image Blob to a JPEG Blob at quality 80.
 * Returns { blob, converted }.
 */
export async function convertWebpToJpeg(blob) {
    const bmp = await decodeImage(blob);
    const width = bmp.width;
    const height = bmp.height;
    const canvas = drawToCanvas(bmp, width, height);
    if (bmp.close) bmp.close();
    const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.8);
    // Release the canvas backing store to keep memory bounded across a large export.
    canvas.width = 0;
    canvas.height = 0;
    return { blob: jpegBlob, converted: true };
}

// ---- EXIF helpers ----

function toDegrees(value) {
    const d = Math.floor(value);
    const m = Math.floor((value - d) * 60);
    const s = Math.trunc((value - d - m / 60) * 3600 * 100);
    return [
        [d, 1],
        [m, 1],
        [s, 100],
    ];
}

function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function dataURLToBlob(dataURL) {
    const [header, base64] = dataURL.split(",");
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

// Encode a JS string as UTF-8 bytes, then map each byte to a Latin1 char so
// piexifjs's internal btoa() can serialize it without a range error.
function utf8ToLatin1Binary(str) {
    const bytes = new TextEncoder().encode(str);
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
}

function formatExifDate(date) {
    // "YYYY:MM:DD HH:MM:SS"
    const pad = (n) => String(n).padStart(2, "0");
    return (
        `${date.getUTCFullYear()}:${pad(date.getUTCMonth() + 1)}:${pad(date.getUTCDate())} ` +
        `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
    );
}

/**
 * Insert EXIF (date, GPS, caption) into a JPEG Blob and return a new Blob.
 * Mirrors update_exif() in the Python script.
 */
export async function updateExif(jpegBlob, takenAt, location, caption) {
    const dataURL = await blobToDataURL(jpegBlob);
    try {
        let exifObj;
        try {
            exifObj = piexif.load(dataURL);
        } catch {
            exifObj = { "0th": {}, Exif: {}, GPS: {}, "1st": {}, thumbnail: null };
        }
        if (!exifObj["0th"]) exifObj["0th"] = {};
        if (!exifObj["Exif"]) exifObj["Exif"] = {};
        if (!exifObj["GPS"]) exifObj["GPS"] = {};

        exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] = formatExifDate(takenAt);

        if (location && typeof location.latitude === "number" && typeof location.longitude === "number") {
            exifObj["GPS"][piexif.GPSIFD.GPSLatitudeRef] = location.latitude >= 0 ? "N" : "S";
            exifObj["GPS"][piexif.GPSIFD.GPSLatitude] = toDegrees(Math.abs(location.latitude));
            exifObj["GPS"][piexif.GPSIFD.GPSLongitudeRef] = location.longitude >= 0 ? "E" : "W";
            exifObj["GPS"][piexif.GPSIFD.GPSLongitude] = toDegrees(Math.abs(location.longitude));
        }

        if (caption) {
            // piexifjs serializes strings via btoa (Latin1 only). Match the Python
            // script's UTF-8 caption encoding by turning the UTF-8 bytes into a
            // Latin1-safe binary string that survives btoa.
            exifObj["0th"][piexif.ImageIFD.ImageDescription] = utf8ToLatin1Binary(caption);
        }

        const exifBytes = piexif.dump(exifObj);
        const newDataURL = piexif.insert(exifBytes, dataURL);
        return dataURLToBlob(newDataURL);
    } catch (err) {
        // Never lose the image over a metadata failure: return the untagged JPEG.
        console.warn("EXIF insertion failed; saving image without metadata:", err.message);
        return jpegBlob;
    }
}

function iptcRecord(dataset, value) {
    const bytes = new TextEncoder().encode(value);
    const record = new Uint8Array(5 + bytes.length);
    record[0] = 0x1c;
    record[1] = 2;
    record[2] = dataset;
    record[3] = (bytes.length >> 8) & 0xff;
    record[4] = bytes.length & 0xff;
    record.set(bytes, 5);
    return record;
}

function concatBytes(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function u16(value) {
    return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function u32(value) {
    return new Uint8Array([
        (value >> 24) & 0xff,
        (value >> 16) & 0xff,
        (value >> 8) & 0xff,
        value & 0xff,
    ]);
}

function bytesFromString(value) {
    const out = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i);
    return out;
}

function photoshopResourceBlock(resourceId, data) {
    const name = new Uint8Array([0]);
    const namePadding = name.length % 2 === 0 ? new Uint8Array(0) : new Uint8Array([0]);
    const dataPadding = data.length % 2 === 0 ? new Uint8Array(0) : new Uint8Array([0]);
    return concatBytes([
        bytesFromString("8BIM"),
        u16(resourceId),
        name,
        namePadding,
        u32(data.length),
        data,
        dataPadding,
    ]);
}

function buildIptcSegment(caption) {
    const records = [];
    records.push(iptcRecord(65, PROCESSING_TOOL)); // Originating Program
    records.push(iptcRecord(115, SOURCE_APP)); // Source
    if (caption) records.push(iptcRecord(120, caption)); // Caption-Abstract

    const resource = photoshopResourceBlock(0x0404, concatBytes(records));
    const payload = concatBytes([bytesFromString("Photoshop 3.0\0"), resource]);
    return concatBytes([new Uint8Array([0xff, 0xed]), u16(payload.length + 2), payload]);
}

function stripApp13Segments(bytes) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
    const parts = [bytes.slice(0, 2)];
    let i = 2;
    while (i + 4 <= bytes.length && bytes[i] === 0xff) {
        let markerOffset = i;
        while (i < bytes.length && bytes[i] === 0xff) i++;
        const marker = bytes[i++];
        if (marker === 0xda || marker === 0xd9) {
            parts.push(bytes.slice(markerOffset));
            return concatBytes(parts);
        }
        const len = (bytes[i] << 8) | bytes[i + 1];
        const end = i + len;
        if (marker !== 0xed) parts.push(bytes.slice(markerOffset, end));
        i = end;
    }
    parts.push(bytes.slice(i));
    return concatBytes(parts);
}

function insertBeforeSos(bytes, segment) {
    let i = 2;
    while (i + 4 <= bytes.length && bytes[i] === 0xff) {
        const markerOffset = i;
        while (i < bytes.length && bytes[i] === 0xff) i++;
        const marker = bytes[i++];
        if (marker === 0xda) {
            return concatBytes([bytes.slice(0, markerOffset), segment, bytes.slice(markerOffset)]);
        }
        if (marker === 0xd9) break;
        const len = (bytes[i] << 8) | bytes[i + 1];
        i += len;
    }
    return bytes;
}

export async function updateIptc(jpegBlob, caption) {
    const bytes = new Uint8Array(await jpegBlob.arrayBuffer());
    const withoutApp13 = stripApp13Segments(bytes);
    const withIptc = insertBeforeSos(withoutApp13, buildIptcSegment(caption));
    return new Blob([withIptc], { type: "image/jpeg" });
}

/**
 * Combine primary and secondary images (BeReal memory layout) onto a canvas.
 * Mirrors combine_images_with_resizing() in the Python script.
 * Returns a JPEG Blob.
 */
export async function combineImages(primaryBlob, secondaryBlob) {
    const cornerRadius = 60;
    const outlineSize = 7;
    const position = { x: 55, y: 55 };
    const scalingFactor = 1 / 3.33333333;

    const primary = await decodeImage(primaryBlob);
    const secondary = await decodeImage(secondaryBlob);

    const canvas = document.createElement("canvas");
    canvas.width = primary.width;
    canvas.height = primary.height;
    const ctx = canvas.getContext("2d");

    // Base: primary image.
    ctx.drawImage(primary, 0, 0);

    const newWidth = Math.round(secondary.width * scalingFactor);
    const newHeight = Math.round(secondary.height * scalingFactor);

    // Black rounded outline.
    roundedRectPath(
        ctx,
        position.x - outlineSize,
        position.y - outlineSize,
        newWidth + outlineSize * 2,
        newHeight + outlineSize * 2,
        cornerRadius + outlineSize
    );
    ctx.fillStyle = "black";
    ctx.fill();

    // Clip to rounded rect and draw secondary.
    ctx.save();
    roundedRectPath(ctx, position.x, position.y, newWidth, newHeight, cornerRadius);
    ctx.clip();
    ctx.drawImage(secondary, position.x, position.y, newWidth, newHeight);
    ctx.restore();

    if (primary.close) primary.close();
    if (secondary.close) secondary.close();

    return await canvasToBlob(canvas, "image/jpeg", 0.9);
}

function roundedRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}
