// Vercel serverless function: /api/transcode
// Warning: ffmpeg in serverless may increase cold start time.
import type { IncomingMessage } from "http";
import type { ServerResponse } from "http";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { Readable } from "stream";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export default async function handler(
  req: IncomingMessage,
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
  const filenameParam = urlObj.searchParams.get("filename") || "audio.mp3";
  const targetFormat = (
    urlObj.searchParams.get("format") || "mp3"
  ).toLowerCase();
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
    const sanitizeFilename = (t: string) =>
      t
        .replace(/[\r\n]+/g, " ")
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
    const toAscii = (t: string) => (t || "").replace(/[^\x20-\x7E]/g, "-");
    let base = filenameParam.toString();
    if (!base.toLowerCase().endsWith(`.${targetFormat}`))
      base = `${base}.${targetFormat}`;
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

    const body: any = (remoteResp as any).body;
    const nodeReadable =
      body && typeof body.getReader === "function"
        ? Readable.fromWeb(body as any)
        : body;

    const command = new (ffmpeg as any)()
      .input(nodeReadable)
      .audioCodec(targetFormat === "mp3" ? "libmp3lame" : "copy")
      .format(targetFormat)
      .on("start", (cmd: string) => console.log("ffmpeg start:", cmd))
      .on("error", (err: any) => {
        console.error("ffmpeg error", err);
        if (!res.headersSent) {
          (res as any)
            .status(500)
            .json({ error: "ffmpeg error", details: String(err) });
        } else {
          try {
            res.end();
          } catch {}
        }
      })
      .on("end", () => console.log("ffmpeg end"));
    if (targetFormat === "mp3") command.audioBitrate(192);
    command.pipe(res as any, { end: true });
  } catch (err: any) {
    console.error("transcode function error", err);
    return (res as any)
      .status(500)
      .json({
        error: "Internal server error",
        details: String(err?.message || err),
      });
  }
}
