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

    // Check if the response is ok before attempting to parse JSON
    if (!response.ok) {
      try {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      } catch {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    }

    // For direct audio file response, create a blob and return metadata
    const audioBlob = await response.blob();
    const downloadUrl = URL.createObjectURL(audioBlob);
    
    // Extract metadata from response headers
    const title = response.headers.get('X-Video-Title') || 'Unknown Title';
    const author = response.headers.get('X-Video-Author') || 'Unknown Author';
    const duration = parseInt(response.headers.get('X-Video-Duration') || '0');
    const thumbnail = response.headers.get('X-Video-Thumbnail') || '';

    return {
      title,
      author,
      duration,
      thumbnail,
      downloadUrl
    };
  }
}