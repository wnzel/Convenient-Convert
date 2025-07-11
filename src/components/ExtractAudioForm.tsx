import React, { useState } from 'react';
import { Youtube as YoutubeIcon, Music, BookIcon as TiktokIcon, ExternalLink } from 'lucide-react';

interface ExtractAudioFormProps {
  // Ensure the onSubmit prop is typed to expect a Promise
  onSubmit: (url: string, format: string) => Promise<void>;
}

const ExtractAudioForm: React.FC<ExtractAudioFormProps> = ({ onSubmit }) => {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('mp3');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateUrl = (url: string): boolean => {
    if (!url) return false;
    // A comprehensive regex for various YouTube URL formats
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]{11,}/;
    return youtubeRegex.test(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateUrl(url)) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      await onSubmit(url, format);
      // Clear the form only after a successful submission
      setUrl('');
    } catch (error) {
      // Display the specific error message bubbled up from the parent
      const errorMessage = error instanceof Error ? error.message : 'Failed to extract audio. Please try again.';
      setError(errorMessage);
    } finally {
      // Ensure the submitting state is always reset
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col items-center mb-8">
        <div className="inline-flex p-3 bg-teal-100 dark:bg-teal-900/30 rounded-full mb-4">
          <Music className="h-8 w-8 text-teal-600 dark:text-teal-400" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Extract Audio from YouTube Videos
        </h3>
        <p className="text-gray-600 dark:text-gray-400 text-center max-w-md">
          Extract high-quality MP3 audio tracks from YouTube videos
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        {/* Source selection */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 p-1">
            <button
              type="button"
              className={`flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow`}
            >
              <YoutubeIcon className="h-4 w-4 mr-2" />
              YouTube
            </button>
            <button
              type="button"
              className={`flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors opacity-50 cursor-not-allowed text-gray-700 dark:text-gray-300`}
              disabled
            >
              <TiktokIcon className="h-4 w-4 mr-2" />
              TikTok (Coming Soon)
            </button>
          </div>
        </div>

        {/* URL input */}
        <div className="mb-6">
          <label htmlFor="video-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            YouTube Video URL
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <YoutubeIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="url"
              id="video-url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="block w-full pl-10 pr-12 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
              required
              disabled={isSubmitting}
            />
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Format selection - MP3 only */}
        <div className="mb-6">
          <label htmlFor="audio-format" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Audio Format
          </label>
          <select
            id="audio-format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="block w-full py-3 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
            disabled={isSubmitting}
          >
            <option value="mp3">MP3 (High Quality)</option>
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            MP3 format provides the best compatibility and quality for audio extraction.
          </p>
        </div>

        {/* Submit button */}
        <div className="flex justify-center">
          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-6 py-3 font-medium rounded-lg shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
              isSubmitting
                ? 'bg-gray-400 cursor-not-allowed text-white'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}
          >
            {isSubmitting ? 'Extracting MP3...' : 'Extract MP3'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ExtractAudioForm;