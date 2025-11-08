const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5175;

app.use(cors());
app.use(express.json());

// Configure ffmpeg binary path if available
try {
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
} catch (e) {
  console.warn(
    "Warning: ffmpeg-static not available; /api/transcode may fail unless ffmpeg is on PATH"
  );
}

const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.VITE_APIFY_TOKEN;
if (!APIFY_TOKEN) {
  console.warn(
    "Warning: APIFY_TOKEN not set in server environment. Set APIFY_TOKEN or VITE_APIFY_TOKEN in server .env"
  );
}

const AUDIO_EXTS = new Set([
  "mp3",
  "m4a",
  "webm",
  "opus",
  "ogg",
  "aac",
  "wav",
  "flac",
]);

app.post("/api/extract", async (req, res) => {
  try {
    const {
      videoUrl,
      desiredFormat,
      includeInfo = true,
      proxyCountry,
      maxWaitMs = 90000,
      pollInterval = 3000,
    } = req.body || {};

    if (!videoUrl) {
      return res.status(400).json({ error: "videoUrl is required" });
    }
    if (!APIFY_TOKEN) {
      return res.status(500).json({ error: "Server missing Apify token" });
    }

    const fmt = (desiredFormat || "").toString().toLowerCase().trim();

    const envActor = process.env.APIFY_ACTOR && process.env.APIFY_ACTOR.trim();
    const actorId = envActor || "scrapearchitect~youtube-audio-mp3-downloader";
    const encodedActorId = encodeURIComponent(actorId);

    const buildBodyForActor = (actor) => {
      if (actor.includes("scrapearchitect~youtube-audio-mp3-downloader")) {
        const body = {
          video_urls: [{ url: videoUrl, method: "GET" }],
        };
        if (includeInfo) body.include_info = true;
        if (proxyCountry) {
          body.proxyConfiguration = {
            useApifyProxy: true,
            apifyProxyCountry: proxyCountry,
          };
        }
        return body;
      }
      return { video_urls: [{ url: videoUrl, method: "GET" }] };
    };

    const startBody = buildBodyForActor(actorId);
    const startResp = await fetch(
      `https://api.apify.com/v2/acts/${encodedActorId}/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(startBody),
      }
    );
    if (!startResp.ok) {
      const text = await startResp.text().catch(() => "");
      return res
        .status(502)
        .json({ error: "Failed to start Apify actor", details: text });
    }
    const startData = await startResp.json();
    const runId = startData?.data?.id || startData?.id;
    if (!runId) {
      return res.status(502).json({
        error: "No run id returned from Apify start response",
        details: startData,
      });
    }
    console.log("Apify run started", { actor: actorId, runId });

    const maxAttempts = Math.max(1, Math.ceil(maxWaitMs / pollInterval));
    let runResult = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const statusResp = await fetch(
        `https://api.apify.com/v2/acts/${encodedActorId}/runs/${runId}?token=${APIFY_TOKEN}`
      );
      if (!statusResp.ok) {
        const t = await statusResp.text().catch(() => "");
        return res
          .status(502)
          .json({ error: "Failed to fetch run status", details: t });
      }
      runResult = await statusResp.json();
      const status = runResult?.data?.status || runResult?.status;
      if (status === "SUCCEEDED") break;
      if (status === "FAILED" || status === "ABORTED") {
        return res
          .status(502)
          .json({ error: `Actor run failed: ${status}`, details: runResult });
      }
    }
    if (!runResult) {
      return res
        .status(502)
        .json({ error: "No run result available after polling" });
    }
    const finalStatus = runResult?.data?.status || runResult?.status;
    if (finalStatus !== "SUCCEEDED") {
      return res.status(502).json({
        error: `Actor run did not finish successfully within ${Math.round(
          maxWaitMs / 1000
        )}s`,
        details: runResult,
      });
    }

    const datasetId =
      runResult?.data?.defaultDatasetId || runResult?.defaultDatasetId;
    if (!datasetId) {
      return res
        .status(502)
        .json({ error: "No dataset id on run result", details: runResult });
    }

    const itemsResp = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`
    );
    if (!itemsResp.ok) {
      const t = await itemsResp.text().catch(() => "");
      return res
        .status(itemsResp.status)
        .json({ error: "Failed to fetch dataset items", details: t });
    }
    const items = await itemsResp.json();
    if (!Array.isArray(items) || !items[0]) {
      return res
        .status(502)
        .json({ error: "No items in dataset", details: items });
    }

    const first = items[0];
    const result = first.result || {};

    let medias = [];
    if (Array.isArray(result.medias)) {
      medias = result.medias;
    } else if (Array.isArray(first.downloadable_audio_links)) {
      const mapMime = (ext) => {
        const e = String(ext || "").toLowerCase();
        if (e === "mp3") return "audio/mpeg";
        if (e === "m4a") return "audio/mp4";
        if (e === "webm" || e === "opus") return "audio/webm";
        if (e === "aac") return "audio/aac";
        return "audio/*";
      };
      const parseBitrate = (s) => {
        if (!s || typeof s !== "string") return undefined;
        const m = s.match(/([\d.]+)\s*kbps/i);
        return m ? parseFloat(m[1]) : undefined;
      };
      medias = first.downloadable_audio_links.map((a) => ({
        url: a.url,
        extension: a.ext || a.extension,
        type: "audio",
        label: a.format || a.language || a.ext,
        language: a.language,
        bitrateKbps: parseBitrate(a.bitrate),
        mimeType: mapMime(a.ext || a.extension),
      }));
    }

    if (!Array.isArray(medias) || medias.length === 0) {
      return res.status(502).json({
        error: "No audio streams found",
        actor: actorId,
        note: "Scrapearchitect audio/mp3 actor returned no downloadable_audio_links",
        rawItem: first,
      });
    }

    const hasVideoCodec = (mime) =>
      typeof mime === "string" && /(^|\s|;)\s*video\//i.test(mime);
    const hasAudioCodec = (mime) =>
      typeof mime === "string" && /(^|\s|;)\s*audio\//i.test(mime);
    const getExt = (m) =>
      (
        m &&
        (m.extension ||
          m.ext ||
          (m.mimeType && m.mimeType.split("/")[1]?.split(";")[0]))
      )?.toLowerCase();
    const isPureAudio = (m) => {
      if (!m) return false;
      const type = m.type && String(m.type).toLowerCase();
      const mime = m.mimeType;
      const ext = getExt(m);
      if (type === "audio") return true;
      if (hasAudioCodec(mime) && !hasVideoCodec(mime)) return true;
      if (AUDIO_EXTS.has(ext) && type !== "video" && !hasVideoCodec(mime))
        return true;
      if (m.label && /\b\d{3,4}p\b/i.test(String(m.label))) return false;
      return false;
    };

    const scored = medias.map((m, idx) => {
      const ext = getExt(m);
      const pure = isPureAudio(m) ? 1 : 0;
      const fmtMatch = fmt && ext === fmt ? 1 : 0;
      const videoPenalty =
        m &&
        (String(m.type).toLowerCase() === "video" || hasVideoCodec(m.mimeType))
          ? -2
          : 0;
      let score = 0;
      score += pure ? 10 : 0;
      score += fmtMatch ? 5 : 0;
      score += videoPenalty;
      score += -idx * 0.001;
      return { m, score, ext };
    });
    scored.sort((a, b) => b.score - a.score);

    let chosenMedia = scored.length ? scored[0].m : null;
    if (chosenMedia && !isPureAudio(chosenMedia)) {
      const bestAudio = scored.find((s) => isPureAudio(s.m));
      if (bestAudio) chosenMedia = bestAudio.m;
    }
    if (chosenMedia && !chosenMedia.extension) {
      const ext = getExt(chosenMedia);
      if (ext) chosenMedia.extension = ext;
    }

    const titleCandidates = [
      first.title,
      result.title,
      first.videoTitle,
      first.video_title,
      first.name,
      first.metadata && first.metadata.title,
      result.author && result.title && `${result.author} - ${result.title}`,
    ].filter((t) => typeof t === "string" && t.trim().length > 0);
    const sanitizeTitle = (t) =>
      t
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
    const rawTitle = titleCandidates[0];
    const title = rawTitle ? sanitizeTitle(rawTitle) : undefined;

    const requestedMp3 = fmt === "mp3";
    const hasMp3 = medias.some(
      (m) => (m.extension || "").toLowerCase() === "mp3"
    );
    const transcodeNeeded = requestedMp3 && !hasMp3;

    const itemWithTitle = {
      ...first,
      title,
      medias,
      chosenMedia,
      transcodeNeeded,
      hasNativeForMp3: medias.some((m) =>
        ["mp3", "m4a", "opus", "webm", "aac"].includes(
          (m.extension || "").toLowerCase()
        )
      ),
    };
    console.log("Apify dataset first item (with title & chosenMedia):", {
      title: itemWithTitle.title,
      chosenExt:
        itemWithTitle.chosenMedia && itemWithTitle.chosenMedia.extension,
      mediasCount: itemWithTitle.medias.length,
      transcodeNeeded: itemWithTitle.transcodeNeeded,
    });

    return res.json({ item: itemWithTitle });
  } catch (err) {
    console.error("Server extract error", err);
    return res
      .status(500)
      .json({ error: "Internal server error", details: String(err) });
  }
});

// Streaming proxy for media download to bypass CORS restrictions
app.get("/api/download", async (req, res) => {
  try {
    const mediaUrl = req.query.url;
    const filenameParam = req.query.filename;
    if (!mediaUrl || typeof mediaUrl !== "string") {
      return res.status(400).json({ error: "Missing url query parameter" });
    }
    // Basic validation to prevent SSRF: only allow http/https
    if (!/^https?:\/\//i.test(mediaUrl)) {
      return res.status(400).json({ error: "Invalid URL protocol" });
    }
    // Fetch remote media (no credentials)
    const remoteResp = await fetch(mediaUrl);
    if (!remoteResp.ok) {
      const t = await remoteResp.text().catch(() => "");
      return res
        .status(remoteResp.status)
        .json({ error: "Upstream fetch failed", details: t });
    }
    const contentType =
      remoteResp.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    const sanitizeFilename = (t) =>
      t
        .replace(/[\r\n]+/g, " ") // remove CR/LF
        .replace(/[\\/:*?"<>|]/g, "-") // common illegal
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
    const toAscii = (t) => (t || "").replace(/[^\x20-\x7E]/g, "-"); // strip non-ASCII
    if (filenameParam && typeof filenameParam === "string") {
      const base = sanitizeFilename(filenameParam);
      const ascii = toAscii(base) || "download";
      const rfc5987 = encodeURIComponent(base).replace(/\*/g, "%2A");
      // Provide both ASCII fallback and UTF-8 filename*
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${ascii.replace(
          /"/g,
          ""
        )}"; filename*=UTF-8''${rfc5987}`
      );
    }
    // Stream body to client
    if (remoteResp.body) {
      remoteResp.body.pipe(res);
    } else {
      const buf = await remoteResp.arrayBuffer();
      res.end(Buffer.from(buf));
    }
  } catch (err) {
    console.error("/api/download error", err);
    res
      .status(500)
      .json({ error: "Internal server error", details: String(err) });
  }
});

// Transcode to MP3 on the fly using ffmpeg
app.get("/api/transcode", async (req, res) => {
  try {
    const mediaUrl = req.query.url;
    const filenameParam = req.query.filename || "audio.mp3";
    const targetFormat = (req.query.format || "mp3").toString().toLowerCase();
    if (!mediaUrl || typeof mediaUrl !== "string") {
      return res.status(400).json({ error: "Missing url query parameter" });
    }
    if (!/^https?:\/\//i.test(mediaUrl)) {
      return res.status(400).json({ error: "Invalid URL protocol" });
    }
    // Fetch source media stream
    const remoteResp = await fetch(mediaUrl);
    if (!remoteResp.ok) {
      const t = await remoteResp.text().catch(() => "");
      return res
        .status(remoteResp.status)
        .json({ error: "Upstream fetch failed", details: t });
    }
    // Prepare headers
    const sanitizeFilename = (t) =>
      t
        .replace(/[\r\n]+/g, " ")
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
    const toAscii = (t) => (t || "").replace(/[^\x20-\x7E]/g, "-");
    let base = filenameParam.toString();
    if (!base.toLowerCase().endsWith(`.${targetFormat}`)) {
      base = `${base}.${targetFormat}`;
    }
    const ascii = toAscii(sanitizeFilename(base)) || `download.${targetFormat}`;
    const rfc5987 = encodeURIComponent(base).replace(/\*/g, "%2A");
    const contentType =
      targetFormat === "mp3" ? "audio/mpeg" : `audio/${targetFormat}`;
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${ascii.replace(
        /"/g,
        ""
      )}"; filename*=UTF-8''${rfc5987}`
    );

    // Transcode pipeline
    const command = ffmpeg()
      .input(remoteResp.body)
      .audioCodec(targetFormat === "mp3" ? "libmp3lame" : "copy")
      .format(targetFormat)
      .on("start", (cmd) => console.log("ffmpeg start:", cmd))
      .on("error", (err) => {
        console.error("ffmpeg error", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "ffmpeg error", details: String(err) });
        } else {
          try {
            res.end();
          } catch (_) {}
        }
      })
      .on("end", () => console.log("ffmpeg end"));

    // Optionally set a reasonable bitrate for mp3
    if (targetFormat === "mp3") {
      command.audioBitrate(192);
    }

    command.pipe(res, { end: true });
  } catch (err) {
    console.error("/api/transcode error", err);
    res
      .status(500)
      .json({ error: "Internal server error", details: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Apify proxy server listening on http://localhost:${PORT}`);
});
