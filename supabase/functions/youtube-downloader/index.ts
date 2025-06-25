import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Define CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Start serving requests
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url, format = 'mp3', apifyToken } = await req.json();

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

    const finalApifyToken = apifyToken || Deno.env.get('APIFY_TOKEN');
    if (!finalApifyToken) {
      console.error('APIFY_TOKEN not provided');
      return new Response(JSON.stringify({ success: false, error: 'APIFY_TOKEN not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Start Apify Actor ---
    const runInput = {
      links: [url],
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] }
    };

    console.log('Starting Apify actor:', JSON.stringify(runInput));
    
    let runResponse: Response;

    try {
      // Race the fetch request against a 30-second timeout
      runResponse = await Promise.race([
        fetch(`https://api.apify.com/v2/acts/jvDjDIPtCZAcZo9jb/runs?token=${finalApifyToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(runInput)
        }),
        new Promise<Response>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout: Starting the Apify actor took too long.')), 30000)
        )
      ]);
    } catch (error) {
      // This block catches the timeout error
      console.error("Error during Apify actor start:", error);
      return new Response(JSON.stringify({
        success: false,
        error: "The download process timed out or failed to start.",
        details: error instanceof Error ? error.message : String(error)
      }), {
        status: 504, // 504 Gateway Timeout
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Handle Apify Start Response ---
    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error('Failed to start Apify actor:', runResponse.status, errorText);
      return new Response(JSON.stringify({
        success: false,
        error: `Failed to start download process: ${runResponse.status} ${errorText}`
      }), {
        status: runResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const runData = await runResponse.json();
    const runId = runData.data.id;
    console.log('Apify run started with ID:', runId);

    // --- Poll for Apify Run Completion ---
    let attempts = 0;
    const maxAttempts = 120; // ~10 minutes
    let runStatus = 'RUNNING';

    while (runStatus === 'RUNNING' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      try {
        const statusResponse = await fetch(`https://api.apify.com/v2/acts/jvDjDIPtCZAcZo9jb/runs/${runId}?token=${finalApifyToken}`);
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          runStatus = statusData.data.status;
          console.log(`Run status check ${attempts + 1}/${maxAttempts}: ${runStatus}`);
        }
      } catch (error) {
        console.error('Error checking run status:', error);
      }
      attempts++;
    }

    if (runStatus !== 'SUCCEEDED') {
      console.error('Apify run failed or timed out. Final status:', runStatus);
      return new Response(JSON.stringify({
        success: false,
        error: `Download process failed. Status: ${runStatus}`,
        debug: { runId, finalStatus: runStatus, attempts }
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Fetch Results from Dataset ---
    console.log('Apify run completed successfully, fetching results...');
    const runDetailsResponse = await fetch(`https://api.apify.com/v2/acts/jvDjDIPtCZAcZo9jb/runs/${runId}?token=${finalApifyToken}`);
    const runDetails = await runDetailsResponse.json();
    const datasetId = runDetails.data.defaultDatasetId;
    
    const resultsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${finalApifyToken}`);
    const results = await resultsResponse.json();

    if (!results || results.length === 0) {
      console.error('No results found in dataset');
      return new Response(JSON.stringify({
        success: false,
        error: 'No results found',
        debug: { datasetId, runId }
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Find Suitable Audio Stream ---
    const videoData = results[0];
    const hasValidUrl = (media: any) => media && media.url && typeof media.url === 'string' && media.url.trim().length > 0;
    
    let audioMedia = null;
    if (videoData.medias && Array.isArray(videoData.medias)) {
      // Find the best available audio-only stream (m4a, mp3, opus, etc.)
      audioMedia = videoData.medias
        .filter((m: any) => hasValidUrl(m) && (m.is_audio === true || m.type === 'audio' || m.vcodec === 'none'))
        .sort((a: any, b: any) => (parseInt(b.abr || '0') - parseInt(a.abr || '0')))[0];
      
      // Fallback: if no audio-only stream, find any stream with an audio codec
      if (!audioMedia) {
        audioMedia = videoData.medias.find((m: any) => hasValidUrl(m) && m.acodec && m.acodec !== 'none');
      }
    }

    if (!audioMedia) {
      console.error('No suitable media found for audio extraction.');
      return new Response(JSON.stringify({
        success: false,
        error: 'No audio format available for this video. The video may be restricted, have no audio track, or be unavailable for download.',
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Return Success Response ---
    const responsePayload = {
      success: true,
      data: {
        title: videoData.title || 'Unknown Title',
        author: videoData.author || 'Unknown Author',
        duration: videoData.duration || 0,
        thumbnail: videoData.thumbnail || '',
        downloadUrl: audioMedia.url,
        format: 'mp3', // We are returning info for an MP3 conversion
      }
    };
    
    console.log('Returning successful response for:', videoData.title);
    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unhandled server error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error.',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});