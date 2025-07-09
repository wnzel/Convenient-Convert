const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url, format = 'mp3' } = await req.json();

    // --- Input Validation ---
    if (!url) {
      return new Response(JSON.stringify({ success: false, error: 'YouTube URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]+/;
    if (!youtubeRegex.test(url)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid YouTube URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Processing YouTube URL:', url);

    // Extract video ID from URL
    let videoId = '';
    if (url.includes('youtube.com/watch?v=')) {
      videoId = url.split('v=')[1]?.split('&')[0] || '';
    } else if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
    } else if (url.includes('youtube.com/embed/')) {
      videoId = url.split('embed/')[1]?.split('?')[0] || '';
    }

    if (!videoId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Could not extract video ID from URL'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Extracted video ID:', videoId);

    // Use a public YouTube API alternative or web scraping approach
    // For now, we'll return a mock response to demonstrate the structure
    // In a real implementation, you would need to use a service like:
    // - YouTube Data API v3 (requires API key)
    // - A third-party service
    // - Web scraping (complex and may violate ToS)
    
    // Mock video information
    const videoInfo = {
      title: 'Sample Video Title',
      uploader: 'Sample Channel',
      duration: 180, // 3 minutes
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    };

    // Since we can't actually extract audio in this environment,
    // we'll return an error message explaining the limitation
    return new Response(JSON.stringify({
      success: false,
      error: 'Audio extraction is currently not available. This feature requires additional server-side tools that are not available in the current environment. Please try uploading audio files directly for conversion instead.'
    }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unhandled server error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error. Please try again later.',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});