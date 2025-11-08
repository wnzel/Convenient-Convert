// Vercel serverless function: /api/extract
// Mirrors logic from Express /api/extract (single scrapearchitect actor)
import type { IncomingMessage } from "http";
import type { ServerResponse } from "http";

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

export default async function handler(
  req: IncomingMessage & { method?: string; body?: any },
  res: ServerResponse & {
    status: (code: number) => any;
    json: (obj: any) => any;
  }
) {
  // Small helpers to emulate Express-style res
  if (!(res as any).status) {
    (res as any).status = function (code: number) {
      res.statusCode = code;
      return res;
    };
  }
  if (!(res as any).json) {
    (res as any).json = function (obj: any) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(obj));
    };
  }

  if (req.method !== "POST") {
    return (res as any).status(405).json({ error: "Method not allowed" });
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  await new Promise<void>((resolve) => req.on("end", () => resolve()));
  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }

  const {
    videoUrl,
    desiredFormat,
    includeInfo = true,
    proxyCountry,
    maxWaitMs = 90000,
    pollInterval = 3000,
  } = body || {};

  const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.VITE_APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return (res as any)
      .status(500)
      .json({ error: "Server missing Apify token" });
  }
  if (!videoUrl) {
    return (res as any).status(400).json({ error: "videoUrl is required" });
  }

  const fmt = (desiredFormat || "").toString().toLowerCase().trim();
  const envActor = process.env.APIFY_ACTOR && process.env.APIFY_ACTOR.trim();
  const actorId = envActor || "scrapearchitect~youtube-audio-mp3-downloader";
  const encodedActorId = encodeURIComponent(actorId);

  const buildBodyForActor = (actor: string) => {
    if (actor.includes("scrapearchitect~youtube-audio-mp3-downloader")) {
      const input: any = { video_urls: [{ url: videoUrl, method: "GET" }] };
      if (includeInfo) input.include_info = true;
      if (proxyCountry) {
        input.proxyConfiguration = {
          useApifyProxy: true,
          apifyProxyCountry: proxyCountry,
        };
      }
      return input;
    }
    return { video_urls: [{ url: videoUrl, method: "GET" }] };
  };

  try {
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
      const text = await startResp.text();
      return (res as any)
        .status(502)
        .json({ error: "Failed to start Apify actor", details: text });
    }
    const startData: any = await startResp.json();
    const runId = startData?.data?.id || startData?.id;
    if (!runId) {
      return (res as any)
        .status(502)
        .json({ error: "No run id returned", details: startData });
    }

    const maxAttempts = Math.max(1, Math.ceil(maxWaitMs / pollInterval));
    let runResult: any = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const statusResp = await fetch(
        `https://api.apify.com/v2/acts/${encodedActorId}/runs/${runId}?token=${APIFY_TOKEN}`
      );
      if (!statusResp.ok) {
        const t = await statusResp.text();
        return (res as any)
          .status(502)
          .json({ error: "Failed to fetch run status", details: t });
      }
      runResult = await statusResp.json();
      const status = runResult?.data?.status || runResult?.status;
      if (status === "SUCCEEDED") break;
      if (status === "FAILED" || status === "ABORTED") {
        return (res as any)
          .status(502)
          .json({ error: `Actor run failed: ${status}`, details: runResult });
      }
    }
    if (!runResult) {
      return (res as any)
        .status(502)
        .json({ error: "No run result after polling" });
    }
    const finalStatus = runResult?.data?.status || runResult?.status;
    if (finalStatus !== "SUCCEEDED") {
      return (res as any)
        .status(502)
        .json({ error: "Actor run timeout", details: runResult });
    }

    const datasetId =
      runResult?.data?.defaultDatasetId || runResult?.defaultDatasetId;
    if (!datasetId) {
      return (res as any)
        .status(502)
        .json({ error: "No dataset id", details: runResult });
    }
    const itemsResp = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`
    );
    if (!itemsResp.ok) {
      const t = await itemsResp.text();
      return (res as any)
        .status(itemsResp.status)
        .json({ error: "Failed to fetch dataset items", details: t });
    }
    const items: any[] = await itemsResp.json();
    if (!Array.isArray(items) || !items[0]) {
      return (res as any)
        .status(502)
        .json({ error: "No items in dataset", details: items });
    }
    const first = items[0];
    const result = first.result || {};

    let medias: any[] = [];
    if (Array.isArray(result.medias)) {
      medias = result.medias;
    } else if (Array.isArray(first.downloadable_audio_links)) {
      const mapMime = (ext: string) => {
        const e = String(ext || "").toLowerCase();
        if (e === "mp3") return "audio/mpeg";
        if (e === "m4a") return "audio/mp4";
        if (e === "webm" || e === "opus") return "audio/webm";
        if (e === "aac") return "audio/aac";
        return "audio/*";
      };
      const parseBitrate = (s: string) => {
        if (!s || typeof s !== "string") return undefined;
        const m = s.match(/([\d.]+)\s*kbps/i);
        return m ? parseFloat(m[1]) : undefined;
      };
      medias = first.downloadable_audio_links.map((a: any) => ({
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
      return (res as any).status(502).json({
        error: "No audio streams found",
        actor: actorId,
        rawItem: first,
      });
    }

    const hasVideoCodec = (mime: string) =>
      typeof mime === "string" && /(^|\s|;)\s*video\//i.test(mime);
    const hasAudioCodec = (mime: string) =>
      typeof mime === "string" && /(^|\s|;)\s*audio\//i.test(mime);
    const getExt = (m: any) =>
      (
        m &&
        (m.extension ||
          m.ext ||
          (m.mimeType && m.mimeType.split("/")[1]?.split(";")[0]))
      )?.toLowerCase();
    const isPureAudio = (m: any) => {
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
      return { m, score };
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
    const rawTitle = titleCandidates[0];
    const sanitizeTitle = (t: string) =>
      t
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
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
    return (res as any).json({ item: itemWithTitle });
  } catch (err: any) {
    console.error("extract function error", err);
    return (res as any)
      .status(500)
      .json({
        error: "Internal server error",
        details: String(err?.message || err),
      });
  }
}
