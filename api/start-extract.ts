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
    const { videoUrl, audioFormat = "mp3" } = req.body || {};
    if (!videoUrl)
      return res.status(400).json({ error: "videoUrl is required" });

    const actorId = encodeURIComponent(
      "thenetaji~youtube-video-and-music-downloader"
    );
    const body: any = {
      urls: [{ url: videoUrl }],
      audioOnly: true,
      audioFormat,
      audioQuality: "320",
      concurrency: 1,
      proxy: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
        apifyProxyCountry: "US",
        // Use a sticky proxy session for better reliability on repeat fetches
        session: `yt-${Date.now()}`,
      },
    };

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
      return res
        .status(502)
        .json({ error: "Failed to start Apify actor", details: text });
    }
    const startData = await startResp.json();
    const runId = startData?.data?.id || startData?.id;
    if (!runId)
      return res
        .status(502)
        .json({ error: "No run id from Apify", details: startData });
    return res.json({ runId });
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: "Internal error", details: String(e) });
  }
}
