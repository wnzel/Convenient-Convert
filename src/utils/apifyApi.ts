export interface ExtractResult {
  audioUrl: string;
  title?: string;
  rawItem?: any;
  actualExtension?: string;
  contentType?: string;
}

export const extractAudioFromYoutube = async (
  videoUrl: string,
  desiredFormat: string
): Promise<ExtractResult> => {
  try {
    console.debug("[apifyApi] Calling local proxy /api/extract for", videoUrl);

    const resp = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl, desiredFormat }),
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

    // New actor returns medias array under result.medias with fields: url, quality, is_audio, type, extension
    const medias: any[] =
      (item as any).medias || (item as any).result?.medias || [];
    const chosenMedia = (item as any).chosenMedia;
    let audioCandidate: string | undefined;
    let actualExtension: string | undefined;
    let contentType: string | undefined;
    if (chosenMedia && chosenMedia.url) {
      audioCandidate = chosenMedia.url;
      actualExtension =
        (chosenMedia.extension || chosenMedia.ext || "").toLowerCase() ||
        undefined;
      contentType = chosenMedia.mimeType || undefined;
    } else if (medias.length) {
      // Prefer exact extension match, then first audio media, then any media.url
      const exact = medias.find(
        (m) =>
          m &&
          m.extension &&
          m.extension.toLowerCase() === desiredFormat.toLowerCase()
      );
      const audioFirst = medias.find(
        (m) => m && (m.is_audio || m.type === "audio")
      );
      const picked = exact || audioFirst || medias[0];
      audioCandidate = picked?.url;
      if (picked) {
        actualExtension =
          (picked.extension || picked.ext || "").toLowerCase() || undefined;
        contentType = picked.mimeType || undefined;
      }
    }

    const candidates = [
      audioCandidate,
      (item as any).downloadUrl,
      (item as any).downloadURL,
      (item as any).fileUrl,
      (item as any).file_url,
      (item as any).url,
      (item as any).path,
      (item as any).file?.url,
      (item as any).files?.[0]?.url,
      (item as any).result?.files?.[0]?.url,
      (item as any).downloadable_audio_link,
      (item as any).merged_downloadable_link,
    ];

    const found = candidates.find((c) => typeof c === "string" && c.length > 0);

    // Title candidates from common actor output keys
    const titleCandidates = [
      (item as any).title,
      (item as any).videoTitle,
      (item as any).name,
      (item as any).video_title,
      (item as any).metadata?.title,
    ];
    const rawTitle = titleCandidates.find(
      (t) => typeof t === "string" && t.trim().length > 0
    );

    const sanitize = (t: string) =>
      t
        .replace(/[\\/:*?"<>|]/g, "-") // remove illegal filename chars
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80); // limit length

    const title = rawTitle ? sanitize(rawTitle) : undefined;

    if (found)
      return {
        audioUrl: found as string,
        title,
        rawItem: item,
        actualExtension,
        contentType,
      };

    // As a last resort, if the item object contains a `files` array with objects that include `downloadUrl` or `url`, try those
    if (Array.isArray((item as any).files) && (item as any).files.length) {
      const f = (item as any).files[0];
      const alt = f?.downloadUrl || f?.downloadURL || f?.url;
      if (alt)
        return {
          audioUrl: alt,
          title,
          rawItem: item,
          actualExtension,
          contentType,
        };
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
