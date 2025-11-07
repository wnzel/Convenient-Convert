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

    const actorId = encodeURIComponent("web.harvester~youtube-downloader");

    const body = {
      includeInfo,
      maxRequestRetries,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
      youtubeUrls: [{ url: videoUrl }],
    };

    if (proxyCountry) {
      body.proxyConfiguration.apifyProxyCountry = proxyCountry;
    }

    const startResp = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run?token=${APIFY_TOKEN}`,
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
    const runId = startData.id;
    if (!runId)
      return res.status(502).json({ error: "No run id returned from Apify" });

    // Poll for run completion
    let status = "RUNNING";
    let runResult = null;
    while (status === "RUNNING") {
      await new Promise((r) => setTimeout(r, 2000));
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
      status = runResult.status;
      if (status === "FAILED" || status === "ABORTED") break;
    }

    if (!runResult || status !== "SUCCEEDED") {
      return res
        .status(502)
        .json({
          error: `Actor run did not succeed: ${status}`,
          details: runResult,
        });
    }

    const datasetId = runResult.defaultDatasetId;
    if (!datasetId)
      return res.status(502).json({ error: "No dataset id on run result" });

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
      return res.status(502).json({ error: "No items in dataset" });

    // Return the first file entry
    return res.json({ item: items[0] });
  } catch (err) {
    console.error("Server extract error", err);
    return res
      .status(500)
      .json({ error: "Internal server error", details: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Apify proxy server listening on http://localhost:${PORT}`);
});
