export class YouTubeDownloaderService {
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private apifyToken: string;

  constructor() {
    this.supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    this.supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    this.apifyToken = import.meta.env.VITE_APIFY_TOKEN;

    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      throw new Error('Supabase configuration is missing');
    }

    if (!this.apifyToken) {
      throw new Error('Apify token is missing');
    }
  }

  async getAudioDownloadUrl(url: string, format: string = 'mp3') {
    const apiUrl = `${this.supabaseUrl}/functions/v1/youtube-downloader`;

    const headers = {
      'Authorization': `Bearer ${this.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        url, 
        format,
        apifyToken: this.apifyToken
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get download URL');
    }

    return data.data;
  }
}