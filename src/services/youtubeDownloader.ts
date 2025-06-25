// YouTube downloader service that calls our Supabase Edge Function
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
  success: boolean;
  data: {
    title: string;
    author: string;
    duration: number;
    thumbnail: string;
    downloadUrl: string;
    format: string;
    quality: string;
  };
  error?: string;
}

class YouTubeDownloaderService {
  private readonly supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  private readonly supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  async getAudioDownloadUrl(url: string, preferredFormat: string = 'mp3'): Promise<{
    downloadUrl: string;
    title: string;
    author: string;
    duration: number;
    thumbnail: string;
  }> {
    try {
      // Validate YouTube URL
      if (!this.isValidYouTubeUrl(url)) {
        throw new Error('Invalid YouTube URL');
      }

      if (!this.supabaseUrl || !this.supabaseAnonKey) {
        throw new Error('Supabase configuration missing. Please set up your Supabase project.');
      }

      const apiUrl = `${this.supabaseUrl}/functions/v1/youtube-downloader`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url,
          format: preferredFormat
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result: YouTubeDownloadResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to download audio');
      }

      return {
        downloadUrl: result.data.downloadUrl,
        title: result.data.title,
        author: result.data.author,
        duration: result.data.duration,
        thumbnail: result.data.thumbnail
      };

    } catch (error) {
      console.error('YouTube download error:', error);
      throw error instanceof Error ? error : new Error('Unknown error occurred');
    }
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