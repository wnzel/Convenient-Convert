const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5175;

app.use(cors());
app.use(express.json());

const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.VITE_APIFY_TOKEN;
if (!APIFY_TOKEN) {
  console.warn(
    "Warning: APIFY_TOKEN not set in server environment. Set APIFY_TOKEN or VITE_APIFY_TOKEN in server .env"
  );
}

app.post("/api/extract", async (req, res) => {
  try {
    const {
      videoUrl,
      maxRequestRetries = 25,
      includeInfo = true,
      proxyCountry,
    } = req.body;

    if (!videoUrl)
      return res.status(400).json({ error: "videoUrl is required" });

    if (!APIFY_TOKEN)
      return res.status(500).json({ error: "Server missing Apify token" });

    // Switchable actor: use thenetaji's Youtube Video & Music Downloader which
    // often provides faster downloads and has explicit audio-only options.
    const actorId = encodeURIComponent(
      "thenetaji~youtube-video-and-music-downloader"
    );

    // Build input for the thenetaji actor. It expects `urls` array and supports
    // audioOnly, audioFormat, audioQuality, and concurrency settings.
    const body = {
      urls: [{ url: videoUrl }],
      audioOnly: true,
      audioFormat: "mp3",
      audioQuality: "320",
      concurrency: 5,
      proxy: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
    };

    if (proxyCountry) {
      body.proxy = body.proxy || {};
      body.proxy.apifyProxyCountry = proxyCountry;
    }

    // Start the actor run asynchronously and poll for completion.
    const startResp = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`,
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
    const runId =
      startData?.data?.id ||
      startData?.id ||
      (startData?.data && startData.data.id);
    console.log("Apify run started", { runId, startData });
    if (!runId)
      return res.status(502).json({
        error: "No run id returned from Apify start response",
        details: startData,
      });

    // Poll for run completion. Allow up to 10 minutes (600000 ms).
    const pollInterval = 2000;
    const maxWaitMs = 10 * 60 * 1000; // 10 minutes
    const maxAttempts = Math.ceil(maxWaitMs / pollInterval);
    let attempt = 0;
    let runResult = null;
    while (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, pollInterval));
      attempt++;
      const statusResp = await fetch(
        `https://api.apify.com/v2/acts/${actorId}/runs/${runId}?token=${APIFY_TOKEN}`
      );
      if (!statusResp.ok) {
        const t = await statusResp.text();
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

    if (!runResult)
      return res
        .status(502)
        .json({ error: "No run result available after polling" });
    const finalStatus = runResult?.data?.status || runResult?.status;
    if (finalStatus !== "SUCCEEDED") {
      return res.status(502).json({
        error: `Actor run did not finish successfully within ${
          maxWaitMs / 1000
        }s`,
        details: runResult,
      });
    }
    const datasetId =
      runResult?.data?.defaultDatasetId ||
      runResult?.defaultDatasetId ||
      runResult?.data?.defaultDatasetId;
    console.log("Apify run succeeded", {
      runId,
      datasetId,
      runResultSummary: { status: finalStatus },
    });
    if (!datasetId)
      return res
        .status(502)
        .json({ error: "No dataset id on run result", details: runResult });

    const itemsResp = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`
    );
    if (!itemsResp.ok) {
      const t = await itemsResp.text();
      return res
        .status(502)
        .json({ error: "Failed to fetch dataset items", details: t });
    }

    const items = await itemsResp.json();
    if (!items || !items[0])
      return res
        .status(502)
        .json({ error: "No items in dataset", details: items });

    // Log the first item for debugging and return it
    console.log("Apify dataset first item:", items[0]);
    return res.json({ item: items[0] });
  } catch (err) {
    console.error("Server extract error", err);
    return res
      .status(500)
      .json({ error: "Internal server error", details: String(err) });
  }
});

// Optional local yt-dlp endpoint: runs yt-dlp installed on the server and streams
// the resulting MP3 back to the client. This avoids Apify and CORS, but requires
// yt-dlp to be installed on the machine running this server.
const { spawn, spawnSync } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

app.post("/api/yt-dlp", async (req, res) => {
  const {
    videoUrl,
    audioFormat = "mp3",
    audioQuality = "320",
    cookies,
    proxy,
  } = req.body || {};
  if (!videoUrl) return res.status(400).json({ error: "videoUrl is required" });

  // Prepare temp output path
  const tmpDir = os.tmpdir();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Include the YouTube title in the output template so we can use it for the download filename.
  // We prefix with the unique id to reliably locate the file after download.
  const outTemplate = path.join(tmpDir, `${id}-%(title)s.%(ext)s`);

  // Resolve yt-dlp executable path from env or fallback to 'yt-dlp'
  const ytdlpCmd = process.env.YTDLP_PATH || "yt-dlp";

  // Build args: extract audio, set format and quality
  const args = [
    "--no-playlist",
    "-x",
    `--audio-format`,
    audioFormat,
    `--audio-quality`,
    audioQuality,
    "-o",
    outTemplate,
  ];

  // If a proxy URL is provided (e.g. socks5://host:port or http://host:port), pass to yt-dlp
  if (proxy && typeof proxy === "string" && proxy.length) {
    args.push("--proxy", proxy);
  }

  // If cookie jar string is provided, write to a temp file and pass --cookies
  let cookieFilePath = null;
  if (cookies && typeof cookies === "string" && cookies.length) {
    try {
      cookieFilePath = path.join(tmpDir, `${id}.cookies.txt`);
      await fs.promises.writeFile(cookieFilePath, cookies, {
        encoding: "utf8",
      });
      args.push("--cookies", cookieFilePath);
    } catch (e) {
      console.error("Failed to write cookies file", e);
      cookieFilePath = null;
    }
  }

  // finally append the URL
  args.push(videoUrl);

  // Preflight validation to avoid ENOENT with clearer guidance
  try {
    const placeholder = (process.env.YTDLP_PATH || "")
      .toLowerCase()
      .includes("full\\\\path\\\\to\\\\yt-dlp.exe");
    if (placeholder) {
      return res.status(500).json({
        error: "Invalid YTDLP_PATH",
        details:
          "YTDLP_PATH is set to an example placeholder. Set it to your real yt-dlp.exe path (e.g., C\\tools\\yt-dlp\\yt-dlp.exe) or install yt-dlp on PATH.",
      });
    }
    if (process.env.YTDLP_PATH) {
      try {
        if (!fs.existsSync(process.env.YTDLP_PATH)) {
          return res.status(500).json({
            error: "YTDLP_PATH file not found",
            details: process.env.YTDLP_PATH,
          });
        }
      } catch (e) {
        // if fs throws, proceed to spawn and let error bubble, but we tried
      }
    } else {
      const whichCmd = process.platform === "win32" ? "where" : "which";
      const check = spawnSync(whichCmd, ["yt-dlp"], { encoding: "utf8" });
      if (!check || check.status !== 0) {
        return res.status(500).json({
          error: "yt-dlp not found",
          details:
            "yt-dlp is not on PATH and YTDLP_PATH is not set. Set YTDLP_PATH to the full yt-dlp.exe path or add yt-dlp to PATH.",
        });
      }
    }
  } catch (_) {}

  console.log("Starting yt-dlp", { cmd: ytdlpCmd, args });

  let timedOut = false;
  let responded = false; // track whether we've already sent a response
  let killTimer; // declared early so error handler can clear it

  // spawn process
  const child = spawn(ytdlpCmd, args, { stdio: ["ignore", "pipe", "pipe"] });

  // Handle spawn errors (ENOENT when yt-dlp not found)
  child.on("error", async (err) => {
    // mark responded first so close handler doesn't try to send again
    responded = true;
    if (killTimer) clearTimeout(killTimer);
    console.error("yt-dlp spawn error", err);
    // cleanup cookie file if present
    if (typeof cookieFilePath !== "undefined" && cookieFilePath) {
      try {
        await fs.promises.unlink(cookieFilePath);
      } catch (e) {}
    }
    try {
      if (!res.headersSent) {
        res
          .status(500)
          .json({ error: "yt-dlp spawn failed", details: String(err) });
      }
    } catch (e) {
      // response may have been already sent; just log
      console.error("Failed to send spawn error response", e);
    }
  });

  // Capture stderr for debugging
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  // Optional timeout for yt-dlp (10 minutes)
  const timeoutMs = 10 * 60 * 1000;
  killTimer = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGKILL");
    } catch (e) {}
  }, timeoutMs);

  child.on("close", async (code) => {
    clearTimeout(killTimer);
    if (responded) {
      // Already sent an error response (spawn error); just cleanup and return
      if (cookieFilePath) {
        try {
          await fs.promises.unlink(cookieFilePath);
        } catch (e) {}
      }
      return;
    }
    if (timedOut) {
      console.error("yt-dlp timed out", { videoUrl });
      if (cookieFilePath) {
        try {
          await fs.promises.unlink(cookieFilePath);
        } catch (e) {}
      }
      responded = true;
      return res.status(504).json({ error: "yt-dlp timed out" });
    }
    if (code !== 0) {
      console.error("yt-dlp failed", { code, stderr });
      if (cookieFilePath) {
        try {
          await fs.promises.unlink(cookieFilePath);
        } catch (e) {}
      }
      responded = true;
      return res.status(502).json({ error: "yt-dlp failed", details: stderr });
    }

    // Discover the downloaded file: it should start with `${id}-` and end in `.${audioFormat}`
    const files = await fs.promises.readdir(tmpDir);
    const match = files.find(
      (f) =>
        f.startsWith(id + "-") && f.toLowerCase().endsWith(`.${audioFormat}`)
    );
    if (!match) {
      console.error("yt-dlp finished but output file not found", {
        id,
        audioFormat,
      });
      if (cookieFilePath) {
        try {
          await fs.promises.unlink(cookieFilePath);
        } catch (e) {}
      }
      responded = true;
      return res
        .status(502)
        .json({ error: "yt-dlp finished but output not found" });
    }
    const fullPath = path.join(tmpDir, match);
    // Derive the original title by stripping the id prefix and extension.
    let originalPart = match.replace(new RegExp(`^${id}-`), "");
    originalPart = originalPart.replace(
      new RegExp(`\.${audioFormat}$`, "i"),
      ""
    );
    // Sanitize filename for header (remove characters invalid on Windows / RFC5987 concerns)
    const safeTitle = originalPart
      .replace(/[\\/:*?"<>|]/g, "_") // Windows invalid chars -> underscore
      .replace(/\s+/g, " ") // collapse whitespace
      .trim();
    const downloadName =
      (safeTitle || `extracted-audio-${id}`) + `.${audioFormat}`;

    responded = true;
    streamFileAndCleanup(fullPath, res, downloadName);
    if (cookieFilePath) {
      try {
        await fs.promises.unlink(cookieFilePath);
      } catch (e) {}
    }
  });

  // Helper to stream file and cleanup
  function streamFileAndCleanup(filePath, res, downloadName) {
    const stat = fs.statSync(filePath);
    const filename = downloadName || path.basename(filePath);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", stat.size);
    // Use RFC 6266 simple form (ASCII). For safety, replace remaining quotes.
    const headerName = filename.replace(/"/g, "'");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${headerName}"`
    );
    const rs = fs.createReadStream(filePath);
    rs.pipe(res);
    rs.on("close", () => {
      // cleanup
      fs.unlink(filePath, (err) => {
        if (err) console.warn("Failed to delete temp file", filePath, err);
      });
    });
    rs.on("error", (err) => {
      console.error("Error streaming file", err);
      try {
        res.end();
      } catch (e) {}
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `Server listening on http://localhost:${PORT} (Apify proxy + yt-dlp endpoints)`
  );
  // Helpful startup log: show how yt-dlp will be invoked
  const resolvedYtDlp = process.env.YTDLP_PATH || "yt-dlp";
  try {
    const exists = process.env.YTDLP_PATH
      ? (() => {
          try {
            return fs.existsSync(process.env.YTDLP_PATH);
          } catch (_) {
            return false;
          }
        })()
      : null;
    console.log(
      "yt-dlp command:",
      resolvedYtDlp,
      exists === null ? "(from PATH)" : `(YTDLP_PATH exists: ${exists})`
    );
  } catch (_) {}
});

// Startup check: warn if yt-dlp is not available on PATH and YTDLP_PATH is not set
try {
  let ytdlpFound = false;
  if (process.env.YTDLP_PATH) {
    try {
      if (fs.existsSync(process.env.YTDLP_PATH)) ytdlpFound = true;
    } catch (e) {}
  }
  if (!ytdlpFound) {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    try {
      const whichRes = spawnSync(whichCmd, ["yt-dlp"]);
      if (whichRes && whichRes.status === 0) ytdlpFound = true;
    } catch (e) {}
  }
  if (!ytdlpFound) {
    console.warn(
      "Warning: yt-dlp not found on PATH and YTDLP_PATH not set. Set YTDLP_PATH to the full yt-dlp.exe path or add yt-dlp to your PATH.\nExample (PowerShell): $env:YTDLP_PATH = 'C:\\\\path\\to\\yt-dlp.exe' && npm run start:server"
    );
  }
} catch (e) {
  // ignore
}
