import { ApifyClient } from 'apify-client';

// Types for the API response
export interface YouTubeMedia {
  url: string;
  quality: string;
  is_audio: boolean;
  type: 'video' | 'audio';
  extension: string;
}

export interface YouTubeResult {
  url: string;
  source: string;
  author: string;
  title: string;
  thumbnail: string;
  duration: number;
  medias: YouTubeMedia[];
  type: string;
  error: boolean;
}

export interface YouTubeDownloadResponse {
  url: string;
  result: YouTubeResult;
}

class YouTubeDownloaderService {
  private client: ApifyClient;
  private readonly actorId = 'jvDjDIPtCZAcZo9jb';

  constructor() {
    const token = import.meta.env.VITE_APIFY_TOKEN;
    if (!token) {
      throw new Error('VITE_APIFY_TOKEN environment variable is required');
    }
    
    this.client = new ApifyClient({
      token: token,
    });
  }

  async downloadVideo(url: string): Promise<YouTubeDownloadResponse> {
    try {
      // Validate YouTube URL
      if (!this.isValidYouTubeUrl(url)) {
        throw new Error('Invalid YouTube URL');
      }

      // Prepare Actor input
      const input = {
        links: [url],
        proxyConfiguration: {
          useApifyProxy: true,
          apifyProxyGroups: ['RESIDENTIAL']
        }
      };

      // Run the Actor and wait for it to finish
      const run = await this.client.actor(this.actorId).call(input);

      // Fetch results from the run's dataset
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
      
      if (!items || items.length === 0) {
        throw new Error('No results returned from the API');
      }

      const result = items[0] as YouTubeDownloadResponse;
      
      if (result.result.error) {
        throw new Error('Failed to process the YouTube video');
      }

      return result;
    } catch (error) {
      console.error('YouTube download error:', error);
      throw error instanceof Error ? error : new Error('Unknown error occurred');
    }
  }

  async getAudioDownloadUrl(url: string, preferredFormat: string = 'mp3'): Promise<{
    downloadUrl: string;
    title: string;
    author: string;
    duration: number;
    thumbnail: string;
  }> {
    const response = await this.downloadVideo(url);
    const { result } = response;

    // Find the best audio format
    const audioMedia = result.medias.find(media => 
      media.is_audio && 
      media.type === 'audio' && 
      media.extension.toLowerCase() === preferredFormat.toLowerCase()
    ) || result.medias.find(media => media.is_audio && media.type === 'audio');

    if (!audioMedia) {
      throw new Error('No audio format available for this video');
    }

    return {
      downloadUrl: audioMedia.url,
      title: result.title,
      author: result.author,
      duration: result.duration,
      thumbnail: result.thumbnail
    };
  }

  async getVideoDownloadUrl(url: string, preferredQuality: string = '720p'): Promise<{
    downloadUrl: string;
    title: string;
    author: string;
    duration: number;
    thumbnail: string;
    quality: string;
  }> {
    const response = await this.downloadVideo(url);
    const { result } = response;

    // Find the best video format
    const videoMedia = result.medias.find(media => 
      !media.is_audio && 
      media.type === 'video' && 
      media.quality === preferredQuality
    ) || result.medias.find(media => !media.is_audio && media.type === 'video');

    if (!videoMedia) {
      throw new Error('No video format available for this video');
    }

    return {
      downloadUrl: videoMedia.url,
      title: result.title,
      author: result.author,
      duration: result.duration,
      thumbnail: result.thumbnail,
      quality: videoMedia.quality
    };
  }

  private isValidYouTubeUrl(url: string): boolean {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]+/;
    return youtubeRegex.test(url);
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

export const youtubeDownloader = new YouTubeDownloaderService();