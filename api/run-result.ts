import fetch from "node-fetch";

// Fetch first item from dataset after run succeeds.
// Query: ?datasetId=...
export default async function handler(req: any, res: any) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  const token = process.env.APIFY_TOKEN;
  if (!token)
    return res.status(500).json({ error: "APIFY_TOKEN not set on server" });

  try {
    const datasetId = (req.query?.datasetId ||
      req.query?.datasetid ||
      req.query?.id) as string;
    if (!datasetId)
      return res.status(400).json({ error: "datasetId query param required" });

    const itemsResp = await (fetch as any)(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`
    );
    if (!itemsResp.ok) {
      const text = await itemsResp.text();
      return res
        .status(502)
        .json({ error: "Failed to fetch dataset items", details: text });
    }
    const items = await itemsResp.json();
    if (!Array.isArray(items) || !items.length) {
      return res
        .status(502)
        .json({ error: "No items in dataset", details: items });
    }
    // Prefer items that look successful and have a downloadable url, ignore obvious errors
    const candidates = items.filter(
      (it: any) =>
        it &&
        !it.error &&
        (it.audioUrl || it.downloadUrl || it.fileUrl || it.url)
    );
    if (!candidates.length) {
      return res
        .status(502)
        .json({
          error: "No downloadable item found (actor likely failed)",
          details: items,
        });
    }
    const pick = candidates[0];
    return res.json({ item: pick });
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: "Internal error", details: String(e) });
  }
}
