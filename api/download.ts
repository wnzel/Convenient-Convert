// Vercel serverless function: /api/download
import type { IncomingMessage } from "http";
import type { ServerResponse } from "http";

export default async function handler(
  req: IncomingMessage & { method?: string; query?: any },
  res: ServerResponse & {
    status: (code: number) => any;
    json: (obj: any) => any;
  }
) {
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
  const urlObj = new URL(req.url || "", "http://localhost");
  const mediaUrl = urlObj.searchParams.get("url");
  const filenameParam = urlObj.searchParams.get("filename");
  if (!mediaUrl)
    return (res as any)
      .status(400)
      .json({ error: "Missing url query parameter" });
  if (!/^https?:\/\//i.test(mediaUrl))
    return (res as any).status(400).json({ error: "Invalid URL protocol" });
  try {
    const remoteResp = await fetch(mediaUrl);
    if (!remoteResp.ok) {
      const t = await remoteResp.text().catch(() => "");
      return (res as any)
        .status(remoteResp.status)
        .json({ error: "Upstream fetch failed", details: t });
    }
    const contentType =
      remoteResp.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    const sanitizeFilename = (t: string) =>
      t
        .replace(/[\r\n]+/g, " ")
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
    const toAscii = (t: string) => (t || "").replace(/[^\x20-\x7E]/g, "-");
    if (filenameParam) {
      const base = sanitizeFilename(filenameParam);
      const ascii = toAscii(base) || "download";
      const rfc5987 = encodeURIComponent(base).replace(/\*/g, "%2A");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${ascii.replace(
          /"/g,
          ""
        )}"; filename*=UTF-8''${rfc5987}`
      );
    }
    if (
      (remoteResp as any).body &&
      typeof (remoteResp as any).body.pipe === "function"
    ) {
      (remoteResp as any).body.pipe(res);
    } else {
      const buf = Buffer.from(await remoteResp.arrayBuffer());
      res.end(buf);
    }
  } catch (err: any) {
    console.error("download function error", err);
    return (res as any)
      .status(500)
      .json({
        error: "Internal server error",
        details: String(err?.message || err),
      });
  }
}
