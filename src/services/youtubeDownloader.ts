export class YouTubeDownloaderService {
  private static readonly SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  private static readonly SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  static async getAudioDownloadUrl(url: string, format: string = 'mp3') {
    const apiUrl = `${this.SUPABASE_URL}/functions/v1/youtube-downloader`;

    const headers = {
      'Authorization': `Bearer ${this.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };

    const body = {
      url,
      format
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      // Try to parse error response
      try {
        const errorData = await response.json();
        // Provide more user-friendly error messages
        const errorMessage = errorData.error || `Service unavailable (${response.status})`;
        throw new Error(errorMessage);
      } catch (parseError) {
        // If we can't parse the error response, provide a generic message
        if (response.status === 503) {
          throw new Error('YouTube audio extraction service is temporarily unavailable. Please try again later.');
        } else if (response.status === 500) {
          throw new Error('Server error occurred. Please try again later.');
        } else {
          throw new Error(`Service error (${response.status}). Please try again later.`);
        }
      }
    }

    // Get video metadata from headers
    const title = response.headers.get('X-Video-Title') || 'Unknown Title';
    const author = response.headers.get('X-Video-Author') || 'Unknown Author';
    const duration = parseInt(response.headers.get('X-Video-Duration') || '0');
    const thumbnail = response.headers.get('X-Video-Thumbnail') || '';

    // Convert response to blob and create download URL
    const audioBlob = await response.blob();
    const downloadUrl = URL.createObjectURL(audioBlob);

    return {
      title,
      author,
      duration,
      thumbnail,
      downloadUrl
    };
  }
}