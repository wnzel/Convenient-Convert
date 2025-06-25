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

    // Check if the response is ok before attempting to parse JSON
    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      
      try {
        // Try to get the response text first
        const responseText = await response.text();
        
        // Try to parse as JSON if possible
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // If not JSON, use the text response (might be HTML error page)
          errorMessage = responseText.length > 200 
            ? `Server error: ${responseText.substring(0, 200)}...` 
            : responseText || errorMessage;
        }
      } catch {
        // If we can't read the response, use the default error message
      }
      
      throw new Error(errorMessage);
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      // If JSON parsing fails, get the response text for debugging
      const responseText = await response.text();
      throw new Error(`Invalid JSON response from server. Response: ${responseText.substring(0, 200)}...`);
    }

    if (!data.success) {
      throw new Error(data.error || 'Failed to get download URL');
    }

    return data.data;
  }
}