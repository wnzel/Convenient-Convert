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

      // Check if Supabase is configured
      if (!this.supabaseUrl || !this.supabaseAnonKey) {
        throw new Error('Supabase is not configured. Please click "Connect to Supabase" in the top right to set up your Supabase project.');
      }

      const apiUrl = `${this.supabaseUrl}/functions/v1/youtube-downloader`;
      
      let response: Response;
      
      try {
        response = await fetch(apiUrl, {
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
      } catch (fetchError) {
        // Handle network errors specifically
        if (fetchError instanceof TypeError && fetchError.message.includes('fetch')) {
          throw new Error('Unable to connect to the audio extraction service. Please check your internet connection and ensure Supabase is properly configured.');
        }
        throw new Error('Network error occurred while trying to extract audio. Please try again.');
      }

      if (!response.ok) {
        let errorMessage = `Service error (${response.status})`;
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If we can't parse the error response, use the status-based message
          if (response.status === 404) {
            errorMessage = 'Audio extraction service not found. Please ensure the Supabase Edge Function is deployed.';
          } else if (response.status === 401) {
            errorMessage = 'Authentication failed. Please check your Supabase configuration.';
          } else if (response.status >= 500) {
            errorMessage = 'Server error occurred. Please try again later.';
          }
        }
        
        throw new Error(errorMessage);
      }

      const result: YouTubeDownloadResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to extract audio from the video');
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
      
      // Re-throw with more user-friendly messages
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error('An unexpected error occurred while extracting audio. Please try again.');
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