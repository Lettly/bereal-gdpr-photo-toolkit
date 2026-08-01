// Video processing with ffmpeg.wasm.
// Mirrors update_mp4_metadata(), has_audio_stream() and copy_audio_between_videos()
// from process-photos.py. ffmpeg is loaded lazily on first use.

// ffmpeg.wasm is vendored under web/vendor/ffmpeg so the Web Worker it spawns is
// same-origin (loading it cross-origin from a CDN is blocked by the browser).
const FFMPEG_DIR = new URL("./vendor/ffmpeg/", import.meta.url).href;

let ffmpeg = null;
let loadingPromise = null;
let fetchFile = null;
let onLogCb = null;

// The single-threaded ffmpeg core has a bounded wasm heap. Over many operations
// its heap/MEMFS fragments and eventually throws "memory access out of bounds".
// We recycle the instance after a number of operations to reset the heap.
let opsSinceLoad = 0;
const OPS_BEFORE_RECYCLE = 10;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
    });
}

async function createInstance() {
    const { FFmpeg } = window.FFmpegWASM;
    const instance = new FFmpeg();
    if (onLogCb) instance.on("log", ({ message }) => onLogCb(message));
    await instance.load({
        coreURL: `${FFMPEG_DIR}ffmpeg-core.js`,
        wasmURL: `${FFMPEG_DIR}ffmpeg-core.wasm`,
    });
    opsSinceLoad = 0;
    return instance;
}

/**
 * Lazily load the vendored @ffmpeg/ffmpeg (single-threaded core).
 */
export async function loadFfmpeg(onLog) {
    if (ffmpeg) return ffmpeg;
    if (loadingPromise) return loadingPromise;

    onLogCb = onLog || null;
    loadingPromise = (async () => {
        // UMD builds expose globals: window.FFmpegWASM and window.FFmpegUtil.
        await loadScript(`${FFMPEG_DIR}ffmpeg.js`);
        await loadScript(`${FFMPEG_DIR}util.js`);
        fetchFile = window.FFmpegUtil.fetchFile;
        ffmpeg = await createInstance();
        return ffmpeg;
    })();

    return loadingPromise;
}

/**
 * Tear down the current ffmpeg instance and spin up a fresh one, releasing the
 * accumulated wasm heap. Called periodically and after a wasm memory error.
 */
async function recycleInstance() {
    try {
        ffmpeg?.terminate();
    } catch {
        /* ignore */
    }
    ffmpeg = await createInstance();
}

/**
 * Run an ffmpeg operation, recycling the instance beforehand when we've done
 * enough ops, and retrying once on a wasm "out of bounds" error with a fresh heap.
 */
async function runOp(fn) {
    if (opsSinceLoad >= OPS_BEFORE_RECYCLE) {
        await recycleInstance();
    }
    opsSinceLoad++;
    try {
        return await fn();
    } catch (err) {
        const msg = String(err?.message || err);
        if (/out of bounds|memory access|abort|OOM/i.test(msg)) {
            // Reset the heap and try the operation one more time.
            await recycleInstance();
            opsSinceLoad++;
            return await fn();
        }
        throw err;
    }
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
    return runOp(async () => {
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
    });
}

/**
 * Check whether an MP4 Blob has an audio stream. Mirrors has_audio_stream().
 * ffmpeg.wasm has no ffprobe, so we parse ffmpeg -i log output for "Audio:".
 */
export async function hasAudioStream(inputBlob) {
    return runOp(async () => {
        const name = "probe.mp4";
        const instance = ffmpeg;
        await instance.writeFile(name, await fetchFile(inputBlob));

        let logText = "";
        const collector = ({ message }) => (logText += message + "\n");
        instance.on("log", collector);
        try {
            // This exec fails (no output specified) but prints stream info to the log.
            await instance.exec(["-i", name]);
        } catch {
            // expected
        } finally {
            instance.off("log", collector);
            try {
                await instance.deleteFile(name);
            } catch {
                /* ignore */
            }
        }
        return /Stream #.*Audio:/.test(logText);
    });
}

/**
 * Copy the audio stream from source into target, keeping target's video and metadata.
 * Returns a new Blob. Mirrors copy_audio_between_videos().
 */
export async function copyAudioBetweenVideos(sourceBlob, targetBlob) {
    return runOp(async () => {
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
    });
}

async function safeDelete(name) {
    try {
        await ffmpeg.deleteFile(name);
    } catch {
        /* ignore */
    }
}
