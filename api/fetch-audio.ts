import fetch from "node-fetch";
import path from "path";

// Serverless proxy to fetch a remote audio file and stream it back to the client to avoid CORS.
export default async function handler(req: any, res: any) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  try {
    const { url, filename, contentType } = req.body || {};
    if (!url) return res.status(400).json({ error: "url is required" });

    const controller = new (global as any).AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000); // 120s safeguard

    const upstream = await (fetch as any)(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!upstream.ok) {
      const t = await upstream.text().catch(() => "");
      return res
        .status(502)
        .json({
          error: "Upstream fetch failed",
          status: upstream.status,
          details: t,
        });
    }

    // Derive headers
    const ct =
      contentType || upstream.headers.get("content-type") || "audio/mpeg";
    let name = filename || path.basename(new URL(url).pathname) || "audio.mp3";
    // Sanitize filename for header
    name = name.replace(/[\\/:*?"<>|]/g, "_");

    const len = upstream.headers.get("content-length");
    if (len) res.setHeader("Content-Length", len);
    res.setHeader("Content-Type", ct);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${name.replace(/"/g, "'")}"`
    );

    // Stream to client
    (upstream as any).body.pipe(res);

    (upstream as any).body.on("error", () => {
      try {
        res.end();
      } catch {}
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: "Internal error", details: String(e) });
  }
}
