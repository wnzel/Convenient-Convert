export class YouTubeDownloaderService {
  private static readonly SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  private static readonly SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
  private static readonly APIFY_TOKEN = 'apify_api_y5ieZgJbNlme3dvg239V7hPdsgqIqb1kK2Ch';

  static async getAudioDownloadUrl(url: string, format: string = 'mp3') {
    const apiUrl = `${this.SUPABASE_URL}/functions/v1/youtube-downloader`;

    const headers = {
      'Authorization': `Bearer ${this.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };

    const body = {
      url,
      format,
      apifyToken: this.APIFY_TOKEN
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get download URL');
    }

    return data.data;
  }
}