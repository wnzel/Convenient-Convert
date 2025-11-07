import fetch from "node-fetch";

// Returns status of a previously started Apify actor run.
// Query: ?runId=...
export default async function handler(req: any, res: any) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  const token = process.env.APIFY_TOKEN;
  if (!token)
    return res.status(500).json({ error: "APIFY_TOKEN not set on server" });

  try {
    const runId = (req.query?.runId ||
      req.query?.runid ||
      req.query?.id) as string;
    if (!runId)
      return res.status(400).json({ error: "runId query param required" });

    const actorId = encodeURIComponent(
      "thenetaji~youtube-video-and-music-downloader"
    );
    const statusResp = await (fetch as any)(
      `https://api.apify.com/v2/acts/${actorId}/runs/${runId}?token=${token}`
    );
    if (!statusResp.ok) {
      const text = await statusResp.text();
      return res
        .status(502)
        .json({ error: "Failed to fetch run status", details: text });
    }
    const statusData = await statusResp.json();
    const status = statusData?.data?.status || statusData?.status;
    const datasetId =
      statusData?.data?.defaultDatasetId || statusData?.defaultDatasetId;
    return res.json({ status, datasetId });
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: "Internal error", details: String(e) });
  }
}
