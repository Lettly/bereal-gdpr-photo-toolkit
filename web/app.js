// Main orchestrator for the BeReal GDPR Photo Toolkit web app.
// Mirrors the processing flow of process-photos.py, entirely client-side.

import { convertWebpToJpeg, updateExif, updateIptc, combineImages } from "./images.js";
import {
    loadFfmpeg,
    updateMp4Metadata,
    hasAudioStream,
    copyAudioBetweenVideos,
} from "./video.js";
import { createAmbientGame } from "./ambient-game.js";

// ---- DOM ----
const el = (id) => document.getElementById(id);
const fileInput = el("file-input");
const browseBtn = el("browse-btn");
const dropzone = el("dropzone");
const fileNameLabel = el("file-name");
const settingsSection = el("settings-section");
const processBtn = el("process-btn");
const progressSection = el("progress-section");
const progressFill = el("progress-fill");
const progressStatus = el("progress-status");
const ambientGame = el("ambient-game");
const ambientStatus = el("ambient-status");
const ambientTimer = el("ambient-timer");
const ambientScore = el("ambient-score");
const logEl = el("log");
const resultSection = el("result-section");
const summaryEl = el("summary");
const downloadBtn = el("download-btn");
const resetBtn = el("reset-btn");

let selectedFile = null;
let outputZipBlob = null;
let fileStreamHandle = null; // FileSystemFileHandle when streaming to disk
let savedToDisk = false;
const ambientGameController = createAmbientGame({
    root: ambientGame,
    status: ambientStatus,
    timer: ambientTimer,
    score: ambientScore,
});

// ---- UI helpers ----
function log(message, kind = "") {
    const line = document.createElement("span");
    if (kind) line.className = kind;
    line.textContent = message + "\n";
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
}

function setProgress(fraction, status) {
    progressFill.style.width = `${Math.round(fraction * 100)}%`;
    if (status) progressStatus.textContent = status;
}

function showFile(file) {
    selectedFile = file;
    fileNameLabel.textContent = file.name;
    settingsSection.classList.remove("hidden");
    settingsSection.scrollIntoView({ behavior: "smooth" });
}

// ---- File selection ----
browseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
    if (fileInput.files.length) showFile(fileInput.files[0]);
});

["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    })
);
["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
    })
);
dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith(".zip")) showFile(file);
    else alert("Please drop a .zip file.");
});

// ---- Path resolution (mirrors resolve_media_path) ----
function normalizeParts(p) {
    return p.replace(/\\/g, "/").replace(/^\/+/, "").split("/").filter(Boolean);
}

function resolveMediaPath(pathFromJson, mediaFiles) {
    const wanted = normalizeParts(pathFromJson);
    const wantedName = wanted[wanted.length - 1];

    // Suffix match on path parts.
    let matches = mediaFiles.filter((f) => {
        const parts = f.parts;
        if (parts.length < wanted.length) return false;
        const tail = parts.slice(parts.length - wanted.length);
        return tail.every((seg, i) => seg === wanted[i]);
    });
    // Fallback: match on filename only.
    if (matches.length === 0) {
        matches = mediaFiles.filter((f) => f.parts[f.parts.length - 1] === wantedName);
    }
    if (matches.length >= 1) {
        if (matches.length > 1) log(`Multiple files match ${pathFromJson}; using ${matches[0].path}`, "warn");
        return matches[0];
    }
    return null;
}

// ---- Filename helpers ----
function timeStr(date) {
    const pad = (n) => String(n).padStart(2, "0");
    // "YYYY-MM-DDTHH-MM-SS" (UTC, matching Python parsing of the Z timestamp)
    return (
        `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T` +
        `${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}-${pad(date.getUTCSeconds())}`
    );
}

function stem(name) {
    const i = name.lastIndexOf(".");
    return i === -1 ? name : name.slice(0, i);
}
function ext(name) {
    const i = name.lastIndexOf(".");
    return i === -1 ? "" : name.slice(i);
}
function basename(path) {
    const parts = normalizeParts(path);
    return parts[parts.length - 1] || path;
}

// Deduplication for the output ZIP (mirrors get_unique_filename).
function uniqueName(name, used) {
    if (!used.has(name)) {
        used.add(name);
        return name;
    }
    const s = stem(name);
    const e = ext(name);
    let counter = 1;
    let candidate = `${s}_${counter}${e}`;
    while (used.has(candidate)) {
        counter++;
        candidate = `${s}_${counter}${e}`;
    }
    used.add(candidate);
    return candidate;
}

// ---- Main processing ----
processBtn.addEventListener("click", async () => {
    const fromVal = el("opt-date-from").value;
    const toVal = el("opt-date-to").value;
    const opts = {
        convertJpeg: el("opt-convert-jpeg").checked,
        keepFilename: el("opt-keep-filename").checked,
        combined: el("opt-combined").checked,
        videoMetadata: el("opt-video-metadata").checked,
        // Inclusive date range on takenAt (UTC). null = unbounded.
        dateFrom: fromVal ? new Date(fromVal + "T00:00:00.000Z") : null,
        dateTo: toVal ? new Date(toVal + "T23:59:59.999Z") : null,
    };

    // Prefer streaming the output straight to disk (keeps memory bounded for large
    // exports). Ask for the destination now, while we still have the click gesture.
    fileStreamHandle = null;
    savedToDisk = false;
    if ("showSaveFilePicker" in window) {
        try {
            fileStreamHandle = await window.showSaveFilePicker({
                suggestedName: "bereal-output.zip",
                types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
            });
        } catch (err) {
            if (err && err.name === "AbortError") {
                // User cancelled the save dialog; abort the whole run.
                return;
            }
            // Picker unavailable/denied: fall back to in-memory + download button.
            fileStreamHandle = null;
        }
    }

    settingsSection.classList.add("hidden");
    progressSection.classList.remove("hidden");
    progressSection.scrollIntoView({ behavior: "smooth" });
    logEl.textContent = "";

    try {
        await processExport(selectedFile, opts);
    } catch (err) {
        ambientGameController.stop();
        console.error(err);
        log(`Fatal error: ${err.message || err}`, "err");
        progressStatus.textContent = "Failed. See log above.";
    }
});

async function processExport(zipFile, opts) {
    const counters = { processed: 0, converted: 0, combined: 0, skipped: 0 };

    setProgress(0.02, "Reading ZIP...");
    const inputZip = await JSZip.loadAsync(zipFile);

    // Index all files.
    const allFiles = [];
    inputZip.forEach((relPath, entry) => {
        if (!entry.dir) allFiles.push({ path: relPath, parts: normalizeParts(relPath), entry });
    });

    const mediaExts = new Set([".webp", ".mp4", ".jpg", ".jpeg"]);
    const mediaFiles = allFiles.filter((f) => mediaExts.has(ext(f.parts[f.parts.length - 1]).toLowerCase()));

    // Locate posts.json.
    const postsCandidates = allFiles.filter((f) => f.parts[f.parts.length - 1] === "posts.json");
    if (postsCandidates.length === 0) throw new Error("The ZIP file does not contain posts.json");
    if (postsCandidates.length > 1) throw new Error("The ZIP file contains more than one posts.json");

    const postsText = await postsCandidates[0].entry.async("string");
    const allPosts = JSON.parse(postsText);

    log(`Number of media files in ZIP: ${mediaFiles.length}`, "ok");
    log(`Posts found: ${allPosts.length}`);

    // Apply the optional date-range filter on takenAt (inclusive, UTC).
    let data = allPosts;
    if (opts.dateFrom || opts.dateTo) {
        data = allPosts.filter((e) => {
            const t = new Date(e.takenAt).getTime();
            if (Number.isNaN(t)) return false;
            if (opts.dateFrom && t < opts.dateFrom.getTime()) return false;
            if (opts.dateTo && t > opts.dateTo.getTime()) return false;
            return true;
        });
        const rangeStr =
            (opts.dateFrom ? opts.dateFrom.toISOString().slice(0, 10) : "start") +
            " to " +
            (opts.dateTo ? opts.dateTo.toISOString().slice(0, 10) : "end");
        log(`Date filter ${rangeStr}: ${data.length} of ${allPosts.length} posts selected.`, "ok");
        if (data.length === 0) throw new Error("No posts fall within the selected date range.");
    }

    // Load ffmpeg up front if any videos need processing.
    const needsFfmpeg =
        opts.videoMetadata &&
        data.some(
            (e) =>
                e.primary?.mediaType === "video" ||
                e.secondary?.mediaType === "video" ||
                "btsMedia" in e
        );
    if (needsFfmpeg) {
        setProgress(0.05, "Loading ffmpeg.wasm (~30 MB, first time only)...");
        log("Loading ffmpeg.wasm...");
        await loadFfmpeg((m) => {
            /* verbose ffmpeg log suppressed */
        });
        log("ffmpeg.wasm ready.", "ok");
    }

    // Output ZIP + name registries.
    const outZip = new JSZip();
    const outFolder = outZip.folder("output");
    const combinedFolder = outFolder.folder("combined");
    const usedNames = new Set();
    const usedCombinedNames = new Set();

    // Cache blobs of processed images so combined step can reuse them.
    const primaryImages = []; // { blob, takenAt, location, caption, isVideo }
    const secondaryImages = []; // { blob, isVideo }

    async function readBlob(mediaFile) {
        return await mediaFile.entry.async("blob");
    }

    ambientGameController.start();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    for (let idx = 0; idx < data.length; idx++) {
        const entry = data[idx];
        setProgress(0.1 + (0.75 * idx) / data.length, `Processing post ${idx + 1} / ${data.length}`);

        try {
            const primaryIsVideo = entry.primary?.mediaType === "video";
            const secondaryIsVideo = entry.secondary?.mediaType === "video";

            const primaryFile = entry.primary ? resolveMediaPath(entry.primary.path, mediaFiles) : null;
            const secondaryFile = entry.secondary ? resolveMediaPath(entry.secondary.path, mediaFiles) : null;
            const btsFile = "btsMedia" in entry ? resolveMediaPath(entry.btsMedia.path, mediaFiles) : null;

            const takenAt = new Date(entry.takenAt); // Z-suffixed ISO -> UTC
            const location = entry.location || null;
            const caption = entry.caption || null;

            const processedVideos = {}; // role -> { name, blob }

            for (const [file, role, isVideo] of [
                [primaryFile, "primary", primaryIsVideo],
                [secondaryFile, "secondary", secondaryIsVideo],
            ]) {
                if (!file) {
                    log(`File not found for ${role} media. Skipping.`, "warn");
                    counters.skipped++;
                    continue;
                }

                const origName = file.parts[file.parts.length - 1];
                const ts = timeStr(takenAt);

                if (isVideo) {
                    log(`Found video: ${origName}`);
                    let newName = opts.keepFilename
                        ? `${ts}_${role}_${origName}`
                        : `${ts}_${role}${ext(origName)}`;
                    newName = uniqueName(newName, usedNames);

                    let blob = await readBlob(file);
                    if (opts.videoMetadata) {
                        blob = await updateMp4Metadata(blob, takenAt, location, caption);
                        log(`Metadata added to ${role} video.`, "ok");
                    }
                    outFolder.file(newName, blob);
                    processedVideos[role] = { name: newName, blob };

                    // Combined images are never made from videos; still record a
                    // placeholder so primary/secondary indices stay aligned.
                    if (opts.combined) {
                        if (role === "primary") {
                            primaryImages.push({ blob: null, takenAt, location, caption, isVideo: true });
                        } else {
                            secondaryImages.push({ blob: null, isVideo: true });
                        }
                    }
                    counters.processed++;
                } else {
                    log(`Found image: ${origName}`);
                    let blob = await readBlob(file);
                    let outName;

                    if (opts.convertJpeg) {
                        const isJpeg = [".jpg", ".jpeg"].includes(ext(origName).toLowerCase());
                        try {
                            if (!isJpeg) {
                                const res = await convertWebpToJpeg(blob);
                                blob = res.blob;
                                counters.converted++;
                            }

                            outName = opts.keepFilename
                                ? `${ts}_${role}_${isJpeg ? origName : `${stem(origName)}.jpg`}`
                                : `${ts}_${role}.jpg`;

                            blob = await updateExif(blob, takenAt, location, caption);
                            blob = await updateIptc(blob, caption);
                            log(`EXIF/IPTC metadata added to ${role} image.`, "ok");
                        } catch (convErr) {
                            // Decoding/encoding failed (e.g. corrupt frame or memory
                            // limit). Preserve the original file rather than dropping it.
                            log(`Could not convert ${origName} (${convErr.message}); keeping original.`, "warn");
                            blob = await readBlob(file);
                            outName = opts.keepFilename
                                ? `${ts}_${role}_${origName}`
                                : `${ts}_${role}${ext(origName)}`;
                        }
                    } else {
                        outName = opts.keepFilename
                            ? `${ts}_${role}_${origName}`
                            : `${ts}_${role}${ext(origName)}`;
                    }

                    outName = uniqueName(outName, usedNames);
                    outFolder.file(outName, blob);

                    // Only retain blobs in memory when combined images are requested;
                    // otherwise release them so a large export stays within memory.
                    if (opts.combined) {
                        if (role === "primary") {
                            primaryImages.push({ blob, takenAt, location, caption, isVideo: false });
                        } else {
                            secondaryImages.push({ blob, isVideo: false });
                        }
                    }
                    counters.processed++;
                }
            }

            // Audio synchronization between primary/secondary videos.
            if (
                opts.videoMetadata &&
                processedVideos.primary &&
                processedVideos.secondary
            ) {
                const p = processedVideos.primary;
                const s = processedVideos.secondary;
                const pHas = await hasAudioStream(p.blob);
                const sHas = await hasAudioStream(s.blob);

                if (pHas && !sHas) {
                    log("Copying audio from primary to secondary video");
                    const merged = await copyAudioBetweenVideos(p.blob, s.blob);
                    outFolder.file(s.name, merged);
                    log("Added audio to secondary video.", "ok");
                } else if (sHas && !pHas) {
                    log("Copying audio from secondary to primary video");
                    const merged = await copyAudioBetweenVideos(s.blob, p.blob);
                    outFolder.file(p.name, merged);
                    log("Added audio to primary video.", "ok");
                } else {
                    log("No audio sync needed.");
                }
            }

            // BTS media.
            if (btsFile) {
                const origName = btsFile.parts[btsFile.parts.length - 1];
                const ts = timeStr(takenAt);
                let newName = opts.keepFilename ? `${ts}_bts_${origName}` : `${ts}_bts${ext(origName)}`;
                newName = uniqueName(newName, usedNames);

                let blob = await readBlob(btsFile);
                if (opts.videoMetadata) {
                    blob = await updateMp4Metadata(blob, takenAt, location, caption);
                    log("Metadata added to BTS media.", "ok");
                }
                outFolder.file(newName, blob);
                counters.processed++;
            } else if ("btsMedia" in entry) {
                log("BTS media file not found. Skipping.", "warn");
                counters.skipped++;
            }
        } catch (err) {
            log(`Error processing post ${idx + 1}: ${err.message || err}`, "err");
        }
    }

    // Combined images.
    if (opts.combined) {
        setProgress(0.86, "Creating combined images...");
        const count = Math.min(primaryImages.length, secondaryImages.length);
        for (let i = 0; i < count; i++) {
            const primary = primaryImages[i];
            const secondary = secondaryImages[i];
            if (primary.isVideo || secondary.isVideo) {
                log("Skipping combined image (contains video).");
                continue;
            }
            try {
                const combined = await combineImages(primary.blob, secondary.blob);
                let withMeta = await updateExif(
                    combined,
                    primary.takenAt,
                    primary.location,
                    primary.caption
                );
                withMeta = await updateIptc(withMeta, primary.caption);
                const name = uniqueName(`${timeStr(primary.takenAt)}_combined.jpg`, usedCombinedNames);
                combinedFolder.file(name, withMeta);
                counters.combined++;
                log(`Combined image saved: ${name}`, "ok");
            } catch (err) {
                log(`Failed to create combined image: ${err.message || err}`, "err");
            }
        }
    }

    // Bundle. Media is already compressed (WebP/JPEG/MP4), so STORE avoids the large
    // CPU/memory cost of DEFLATE for a negligible size difference.
    setProgress(0.95, "Building output ZIP...");
    outputZipBlob = null;

    if (fileStreamHandle) {
        // Stream the ZIP straight to the user-selected file to keep memory bounded.
        const writable = await fileStreamHandle.createWritable();
        await new Promise((resolve, reject) => {
            const stream = outZip.generateInternalStream({
                type: "uint8array",
                compression: "STORE",
                streamFiles: true,
            });
            stream.on("data", async (chunk, meta) => {
                stream.pause();
                try {
                    await writable.write(chunk);
                    setProgress(0.95 + 0.05 * (meta.percent / 100), "Writing output ZIP to disk...");
                    stream.resume();
                } catch (err) {
                    reject(err);
                }
            });
            stream.on("error", reject);
            stream.on("end", async () => {
                try {
                    await writable.close();
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
            stream.resume();
        });
        savedToDisk = true;
    } else {
        outputZipBlob = await outZip.generateAsync(
            { type: "blob", compression: "STORE", streamFiles: true },
            (meta) => setProgress(0.95 + 0.05 * (meta.percent / 100), "Building output ZIP...")
        );
    }

    setProgress(1, "Done.");
    ambientGameController.stop();
    log(
        `Finished processing. Processed: ${counters.processed}, Converted: ${counters.converted}, ` +
            `Skipped: ${counters.skipped}, Combined: ${counters.combined}`,
        "ok"
    );

    showSummary(counters, mediaFiles.length);
}

function showSummary(counters, inputCount) {
    summaryEl.innerHTML = "";
    const stats = [
        ["Input files", inputCount],
        ["Processed", counters.processed],
        ["Converted", counters.converted],
        ["Combined", counters.combined],
        ["Skipped", counters.skipped],
    ];
    for (const [label, num] of stats) {
        const div = document.createElement("div");
        div.className = "stat";
        div.innerHTML = `<span class="num">${num}</span><span class="label">${label}</span>`;
        summaryEl.appendChild(div);
    }
    if (savedToDisk) {
        // Already written to the user-chosen file; no download button needed.
        downloadBtn.classList.add("hidden");
        const note = document.createElement("p");
        note.className = "hint";
        note.textContent = `Output ZIP saved to ${fileStreamHandle.name}.`;
        summaryEl.after(note);
    } else {
        downloadBtn.classList.remove("hidden");
    }

    resultSection.classList.remove("hidden");
    resultSection.scrollIntoView({ behavior: "smooth" });
}

// ---- Download / reset ----
downloadBtn.addEventListener("click", () => {
    if (!outputZipBlob) return;
    const url = URL.createObjectURL(outputZipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bereal-output.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});

resetBtn.addEventListener("click", () => {
    selectedFile = null;
    outputZipBlob = null;
    fileInput.value = "";
    fileNameLabel.textContent = "";
    logEl.textContent = "";
    setProgress(0, "");
    ambientGameController.stop();
    [settingsSection, progressSection, resultSection].forEach((s) => s.classList.add("hidden"));
    window.scrollTo({ top: 0, behavior: "smooth" });
});
