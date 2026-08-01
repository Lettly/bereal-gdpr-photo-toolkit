// Video processing with ffmpeg.wasm.
// Mirrors update_mp4_metadata(), has_audio_stream() and copy_audio_between_videos()
// from process-photos.py. ffmpeg is loaded lazily on first use.

// ffmpeg.wasm is vendored under web/vendor/ffmpeg so the Web Worker it spawns is
// same-origin (loading it cross-origin from a CDN is blocked by the browser).
const FFMPEG_DIR = new URL("./vendor/ffmpeg/", import.meta.url).href;

let ffmpeg = null;
let loadingPromise = null;
let fetchFile = null;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
    });
}

/**
 * Lazily load the vendored @ffmpeg/ffmpeg (single-threaded core).
 */
export async function loadFfmpeg(onLog) {
    if (ffmpeg) return ffmpeg;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
        // UMD builds expose globals: window.FFmpegWASM and window.FFmpegUtil.
        await loadScript(`${FFMPEG_DIR}ffmpeg.js`);
        await loadScript(`${FFMPEG_DIR}util.js`);

        const { FFmpeg } = window.FFmpegWASM;
        fetchFile = window.FFmpegUtil.fetchFile;

        ffmpeg = new FFmpeg();
        if (onLog) {
            ffmpeg.on("log", ({ message }) => onLog(message));
        }

        await ffmpeg.load({
            coreURL: `${FFMPEG_DIR}ffmpeg-core.js`,
            wasmURL: `${FFMPEG_DIR}ffmpeg-core.wasm`,
        });
        return ffmpeg;
    })();

    return loadingPromise;
}

function pad(n) {
    return String(n).padStart(2, "0");
}

function creationTime(date) {
    // "YYYY-MM-DDTHH:MM:SS"
    return (
        `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T` +
        `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
    );
}

function iso6709(lat, lng) {
    const fmt = (v) => (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(6);
    return `${fmt(lat)}${fmt(lng)}/`;
}

async function readOutput(name) {
    const data = await ffmpeg.readFile(name);
    return new Blob([data.buffer], { type: "video/mp4" });
}

/**
 * Inject creation date, GPS and caption metadata into an MP4 Blob.
 * Returns a new Blob. Mirrors update_mp4_metadata().
 */
export async function updateMp4Metadata(inputBlob, takenAt, location, caption) {
    const inName = "in.mp4";
    const outName = "out.mp4";
    await ffmpeg.writeFile(inName, await fetchFile(inputBlob));

    const args = ["-i", inName, "-c", "copy", "-metadata", `creation_time=${creationTime(takenAt)}`];

    if (location && typeof location.latitude === "number" && typeof location.longitude === "number") {
        const lat = location.latitude;
        const lng = location.longitude;
        args.push(
            "-metadata",
            `location=${iso6709(lat, lng)}`,
            "-metadata",
            `com.apple.quicktime.location.ISO6709=${iso6709(lat, lng)}`,
            "-metadata",
            `location-eng=${lat},${lng}`
        );
    }
    if (caption) {
        args.push("-metadata", `title=${caption}`);
    }
    args.push(outName);

    await ffmpeg.exec(args);
    const result = await readOutput(outName);
    await safeDelete(inName);
    await safeDelete(outName);
    return result;
}

/**
 * Check whether an MP4 Blob has an audio stream. Mirrors has_audio_stream().
 * ffmpeg.wasm has no ffprobe, so we parse ffmpeg -i log output for "Audio:".
 */
export async function hasAudioStream(inputBlob) {
    const name = "probe.mp4";
    await ffmpeg.writeFile(name, await fetchFile(inputBlob));

    let logText = "";
    const collector = ({ message }) => (logText += message + "\n");
    ffmpeg.on("log", collector);
    try {
        // This exec fails (no output specified) but prints stream info to the log.
        await ffmpeg.exec(["-i", name]);
    } catch {
        // expected
    } finally {
        ffmpeg.off("log", collector);
        await safeDelete(name);
    }
    return /Stream #.*Audio:/.test(logText);
}

/**
 * Copy the audio stream from source into target, keeping target's video and metadata.
 * Returns a new Blob. Mirrors copy_audio_between_videos().
 */
export async function copyAudioBetweenVideos(sourceBlob, targetBlob) {
    const srcName = "src.mp4";
    const tgtName = "tgt.mp4";
    const outName = "merged.mp4";
    await ffmpeg.writeFile(srcName, await fetchFile(sourceBlob));
    await ffmpeg.writeFile(tgtName, await fetchFile(targetBlob));

    const baseArgs = [
        "-i", tgtName,
        "-i", srcName,
        "-c:v", "copy",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-map_metadata", "0",
        "-shortest",
        "-avoid_negative_ts", "make_zero",
        "-y",
    ];

    try {
        // Try stream copy (no re-encode) first.
        await ffmpeg.exec([...baseArgs.slice(0, 6), "-c:a", "copy", ...baseArgs.slice(6), outName]);
    } catch {
        // Fallback to AAC re-encode.
        await ffmpeg.exec([
            ...baseArgs.slice(0, 6),
            "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
            ...baseArgs.slice(6),
            outName,
        ]);
    }

    const result = await readOutput(outName);
    await safeDelete(srcName);
    await safeDelete(tgtName);
    await safeDelete(outName);
    return result;
}

async function safeDelete(name) {
    try {
        await ffmpeg.deleteFile(name);
    } catch {
        /* ignore */
    }
}
