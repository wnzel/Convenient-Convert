import React, { useState } from "react";
import {
  YoutubeIcon,
  Music,
  BookIcon as TiktokIcon,
  ExternalLink,
  Loader2,
} from "lucide-react";
// using server-side /api/yt-dlp endpoint instead of client-side Apify call

interface ExtractAudioFormProps {
  // Pass back the object URL and optional filename derived from server headers
  onSubmit: (url: string, format: string, filename?: string) => void;
}

const ExtractAudioForm: React.FC<ExtractAudioFormProps> = ({ onSubmit }) => {
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState("mp3");
  const [urlType, setUrlType] = useState<"youtube" | "tiktok">("youtube");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Advanced options removed per request; only keep essential fields.

  const validateUrl = (url: string, type: "youtube" | "tiktok"): boolean => {
    if (!url) return false;

    if (type === "youtube") {
      // Simple validation for YouTube URLs
      return url.includes("youtube.com/") || url.includes("youtu.be/");
    } else {
      // Simple validation for TikTok URLs
      return url.includes("tiktok.com/");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateUrl(url, urlType)) {
      setError(
        `Please enter a valid ${
          urlType === "youtube" ? "YouTube" : "TikTok"
        } URL`
      );
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      if (urlType === "youtube") {
        const isProd = import.meta.env.PROD;
        if (isProd) {
          // Production: use Apify via serverless functions with polling
          const startResp = await fetch("/api/start-extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl: url, audioFormat: format }),
          });
          if (!startResp.ok) throw new Error(await startResp.text());
          const { runId } = await startResp.json();
          if (!runId) throw new Error("No runId returned");

          const pollInterval = 2500;
          const maxMs = 10 * 60 * 1000; // 10 minutes
          const start = Date.now();
          let datasetId: string | undefined;
          while (Date.now() - start < maxMs) {
            await new Promise((r) => setTimeout(r, pollInterval));
            const st = await fetch(
              `/api/run-status?runId=${encodeURIComponent(runId)}`
            );
            if (!st.ok) throw new Error(await st.text());
            const sdata = await st.json();
            if (sdata.status === "SUCCEEDED") {
              datasetId = sdata.datasetId;
              break;
            }
            if (["FAILED", "ABORTED"].includes(sdata.status))
              throw new Error(`Actor run failed: ${sdata.status}`);
          }
          if (!datasetId) throw new Error("Timed out waiting for success");
          const resultResp = await fetch(
            `/api/run-result?datasetId=${encodeURIComponent(datasetId)}`
          );
          if (!resultResp.ok) throw new Error(await resultResp.text());
          const { item } = await resultResp.json();
          const title: string | undefined = item?.title || item?.videoTitle;
          const candidate =
            item?.audioUrl || item?.downloadUrl || item?.fileUrl || item?.url;
          if (!candidate) throw new Error("No audio URL found in result");
          const dl = await fetch(candidate);
          if (!dl.ok) throw new Error("Failed to fetch audio file");
          const blob = await dl.blob();
          const objectUrl = URL.createObjectURL(blob);
          const filename = title
            ? `${title.replace(/[\\/:*?"<>|]/g, "_")}.${format}`
            : undefined;
          onSubmit(objectUrl, format, filename);
        } else {
          // Development: use local yt-dlp streaming endpoint
          const body: any = { videoUrl: url, audioFormat: format };
          const resp = await fetch("/api/yt-dlp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Server error: ${resp.status} ${text}`);
          }
          const cd =
            resp.headers.get("Content-Disposition") ||
            resp.headers.get("content-disposition");
          let filename: string | undefined;
          if (cd) {
            const m1 = cd.match(/filename\s*=\s*"([^"]+)"/i);
            if (m1 && m1[1]) filename = m1[1];
            else {
              const m2 = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)$/i);
              if (m2 && m2[1]) {
                try {
                  filename = decodeURIComponent(m2[1]);
                } catch {
                  filename = m2[1];
                }
              }
            }
          }
          const blob = await resp.blob();
          const objectUrl = URL.createObjectURL(blob);
          onSubmit(objectUrl, format, filename);
        }
      } else {
        // TikTok implementation would go here
        setError("TikTok extraction is not yet supported");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Provide the underlying error message so the user (or developer) can debug.
      setError(`Failed to extract audio: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col items-center mb-8">
        <div className="inline-flex p-3 bg-teal-100 dark:bg-teal-900/30 rounded-full mb-4">
          <Music className="h-8 w-8 text-teal-600 dark:text-teal-400" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Extract Audio from Videos
        </h3>
        <p className="text-gray-600 dark:text-gray-400 text-center max-w-md">
          Extract audio tracks from YouTube or TikTok videos in your preferred
          format
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        {/* Source selection */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 p-1">
            <button
              type="button"
              onClick={() => setUrlType("youtube")}
              className={`flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                urlType === "youtube"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              <YoutubeIcon className="h-4 w-4 mr-2" />
              YouTube
            </button>
            <button
              type="button"
              onClick={() => setUrlType("tiktok")}
              className={`flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                urlType === "tiktok"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              <TiktokIcon className="h-4 w-4 mr-2" />
              TikTok
            </button>
          </div>
        </div>

        {/* URL input */}
        <div className="mb-6">
          <label
            htmlFor="video-url"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Video URL
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              {urlType === "youtube" ? (
                <YoutubeIcon className="h-5 w-5 text-gray-400" />
              ) : (
                <TiktokIcon className="h-5 w-5 text-gray-400" />
              )}
            </div>
            <input
              type="url"
              id="video-url"
              placeholder={`Enter ${
                urlType === "youtube" ? "YouTube" : "TikTok"
              } video URL`}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="block w-full pl-10 pr-12 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
              required
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <a
                href={
                  urlType === "youtube"
                    ? "https://youtube.com"
                    : "https://tiktok.com"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        {/* Format selection */}
        <div className="mb-6">
          <label
            htmlFor="audio-format"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Audio Format
          </label>
          <select
            id="audio-format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="block w-full py-3 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
          >
            <option value="mp3">MP3</option>
            <option value="m4a">M4A</option>
            <option value="wav">WAV</option>
            <option value="flac">FLAC</option>
            <option value="ogg">OGG</option>
          </select>
        </div>

        {/* Advanced options removed */}

        {/* Submit button */}
        <div className="flex justify-center">
          <button
            type="submit"
            disabled={isLoading}
            className={`px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 flex items-center ${
              isLoading ? "opacity-75 cursor-not-allowed" : ""
            }`}
          >
            {isLoading && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
            {isLoading ? "Extracting..." : "Extract Audio"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ExtractAudioForm;
