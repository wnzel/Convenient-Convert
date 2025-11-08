import React, { useState } from "react";
import {
  YoutubeIcon,
  Music,
  BookIcon as TiktokIcon,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { extractAudioFromYoutube, type ExtractResult } from "../utils/apifyApi";

interface ExtractAudioFormProps {
  onSubmit: (
    url: string,
    format: string,
    title?: string,
    actualExtension?: string
  ) => void;
}

const ExtractAudioForm: React.FC<ExtractAudioFormProps> = ({ onSubmit }) => {
  const [url, setUrl] = useState("");
  const [urlType, setUrlType] = useState<"youtube" | "tiktok">("youtube");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
        const result: ExtractResult = await extractAudioFromYoutube(url, "mp3");
        const actualExt = (result.actualExtension || "").toLowerCase();
        // Always deliver MP3 (transcode if needed downstream)
        onSubmit(result.audioUrl, "mp3", result.title, actualExt);
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
          Extract audio tracks from YouTube or TikTok videos as MP3
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

        {/* Fixed output format display */}
        <div className="mb-6">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Audio Format
          </span>
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 border border-teal-200 dark:border-teal-800 w-fit">
            MP3
          </div>
        </div>

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
