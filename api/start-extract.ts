import fetch from "node-fetch";

// Starts an Apify actor run asynchronously and returns its runId.
// Expects JSON body: { videoUrl: string, audioFormat?: string }
export default async function handler(req: any, res: any) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  const token = process.env.APIFY_TOKEN;
  if (!token)
    return res.status(500).json({ error: "APIFY_TOKEN not set on server" });

  try {
    const {
      videoUrl,
      audioFormat = "mp3",
      quality,
      attempts = 3,
    } = req.body || {};
    if (!videoUrl)
      return res.status(400).json({ error: "videoUrl is required" });

    // Extract YouTube video ID if a URL was provided
    const extractYouTubeId = (input: string): string | null => {
      try {
        if (/^[A-Za-z0-9_-]{10,}$/.test(input) && !input.includes("/"))
          return input;
        const u = new URL(input);
        if (u.hostname.includes("youtu.be")) {
          const id = u.pathname.replace(/^\//, "").split("/")[0];
          return id || null;
        }
        if (u.hostname.includes("youtube.com")) {
          const v = u.searchParams.get("v");
          if (v) return v;
          const parts = u.pathname.split("/").filter(Boolean);
          const maybeId = parts[parts.length - 1];
          if (maybeId && /^[A-Za-z0-9_-]{6,}$/.test(maybeId)) return maybeId;
        }
        return null;
      } catch {
        return null;
      }
    };
    const videoId = extractYouTubeId(videoUrl) || videoUrl;

    // Candidate actors (try primary, then fallback). You can extend this list.
    const actorCandidates = [
      "transcriptdl~transcript-downloader-youtube-audio-scraper",
      "thenetaji~youtube-video-and-music-downloader",
      "web.harvester~youtube-downloader",
    ];

    const chosenQuality = quality || "192"; // lower quality to reduce 403 likelihood
    let lastError: any = null;
    for (let attemptIdx = 0; attemptIdx < attempts; attemptIdx++) {
      const actorName = actorCandidates[attemptIdx % actorCandidates.length];
      const actorId = encodeURIComponent(actorName);
      const session = `yt-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      let body: any;
      if (actorName.startsWith("transcriptdl~")) {
        const tdToken = process.env.TRANSCRIPT_API_TOKEN;
        if (!tdToken) {
          lastError = {
            actor: actorName,
            error: "TRANSCRIPT_API_TOKEN not set",
          };
          continue;
        }
        body = {
          videoIds: [videoId],
          apiToken: tdToken,
          downloadToApify: true,
          maxWaitTime: 10,
          pollingInterval: 60,
        };
      } else {
        body = {
          urls: [{ url: videoUrl }],
          audioOnly: true,
          audioFormat,
          audioQuality: chosenQuality,
          concurrency: 1,
          proxy: {
            useApifyProxy: true,
            session,
          },
        };
      }
      try {
        const startResp = await fetch(
          `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        if (!startResp.ok) {
          const text = await startResp.text();
          lastError = {
            actor: actorName,
            status: startResp.status,
            details: text,
          };
          continue; // try next actor/attempt
        }
        const startData = await startResp.json();
        const runId = startData?.data?.id || startData?.id;
        if (!runId) {
          lastError = { actor: actorName, details: startData };
          continue;
        }
        return res.json({
          runId,
          actor: actorName,
          quality: chosenQuality,
          attempt: attemptIdx + 1,
        });
      } catch (err: any) {
        lastError = { actor: actorName, error: String(err) };
        continue;
      }
    }
    return res
      .status(502)
      .json({ error: "Failed to start any actor run", lastError });
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: "Internal error", details: String(e) });
  }
}
