// This utility calls the local server-side proxy at /api/extract.
// The server keeps the Apify token and performs the actor run (avoids CORS & token leakage).
export const extractAudioFromYoutube = async (
  videoUrl: string
): Promise<string> => {
  try {
    console.debug("[apifyApi] Calling local proxy /api/extract for", videoUrl);

    const resp = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[apifyApi] Proxy error:", resp.status, text);
      throw new Error(`Proxy error: ${resp.status} ${text}`);
    }

    const data = await resp.json();
    const item = data?.item;
    if (!item) throw new Error("Proxy returned no item");

    // Log full item for debugging (server also logs it)
    console.debug("[apifyApi] Received item from proxy:", item);

    // Try multiple common fields where the actor may put the downloadable URL
    const candidates = [
      (item as any).downloadUrl,
      (item as any).downloadURL,
      (item as any).fileUrl,
      (item as any).file_url,
      (item as any).url,
      (item as any).path,
      (item as any).file?.url,
      (item as any).files?.[0]?.url,
      (item as any).result?.files?.[0]?.url,
    ];

    const found = candidates.find((c) => typeof c === "string" && c.length > 0);
    if (found) return found as string;

    // As a last resort, if the item object contains a `files` array with objects that include `downloadUrl` or `url`, try those
    if (Array.isArray((item as any).files) && (item as any).files.length) {
      const f = (item as any).files[0];
      const alt = f?.downloadUrl || f?.downloadURL || f?.url;
      if (alt) return alt;
    }

    throw new Error(
      "Proxy returned an item but no recognizable download URL was found"
    );
  } catch (err: unknown) {
    console.error("Audio extraction error:", err);
    if (err instanceof TypeError && /failed to fetch/i.test(err.message)) {
      throw new Error(
        "Network error when contacting Apify API (possible CORS or network problem).\n" +
          "Server proxy is recommended. Run the local proxy server (server/index.js) and restart dev."
      );
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
};
