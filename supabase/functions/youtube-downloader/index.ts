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
      console.log('Available media streams:', videoData.medias.length);
      
      // Filter out streams without valid URLs
      const validStreams = videoData.medias.filter(hasValidUrl);
      console.log('Valid streams with URLs:', validStreams.length);
      
      // Priority 1: Audio-only streams (vcodec is 'none' and acodec is present)
      const audioOnlyStreams = validStreams.filter((m: any) => 
        (m.vcodec === 'none' || m.is_audio === true || m.type === 'audio') && 
        m.acodec && m.acodec !== 'none'
      );
      
      if (audioOnlyStreams.length > 0) {
        // Sort by audio bitrate (abr) descending, fallback to tbr if abr not available
        audioMedia = audioOnlyStreams.sort((a: any, b: any) => {
          const aRate = parseInt(a.abr || a.tbr || '0');
          const bRate = parseInt(b.abr || b.tbr || '0');
          return bRate - aRate;
        })[0];
        console.log('Selected audio-only stream with bitrate:', audioMedia.abr || audioMedia.tbr);
      }
      
      // Priority 2: Combined video/audio streams with audio codec
      if (!audioMedia) {
        const combinedStreams = validStreams.filter((m: any) => 
          m.acodec && m.acodec !== 'none' && m.vcodec && m.vcodec !== 'none'
        );
        
        if (combinedStreams.length > 0) {
          // Sort by total bitrate (tbr) descending, fallback to abr
          audioMedia = combinedStreams.sort((a: any, b: any) => {
            const aRate = parseInt(a.tbr || a.abr || '0');
            const bRate = parseInt(b.tbr || b.abr || '0');
            return bRate - aRate;
          })[0];
          console.log('Selected combined stream with bitrate:', audioMedia.tbr || audioMedia.abr);
        }
      }
      
      // Priority 3: Any stream with audio codec (last resort)
      if (!audioMedia) {
        const anyAudioStreams = validStreams.filter((m: any) => 
          m.acodec && m.acodec !== 'none'
        );
        
        if (anyAudioStreams.length > 0) {
          audioMedia = anyAudioStreams.sort((a: any, b: any) => {
            const aRate = parseInt(a.tbr || a.abr || a.br || '0');
            const bRate = parseInt(b.tbr || b.abr || b.br || '0');
            return bRate - aRate;
          })[0];
          console.log('Selected fallback audio stream with bitrate:', audioMedia.tbr || audioMedia.abr || audioMedia.br);
        }
      }
      
      // Priority 4: Streams with common audio extensions (final fallback)
      if (!audioMedia) {
        const audioExtensions = ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav'];
        const extensionStreams = validStreams.filter((m: any) => 
          m.ext && audioExtensions.includes(m.ext.toLowerCase())
        );
        
        if (extensionStreams.length > 0) {
          audioMedia = extensionStreams[0];
          console.log('Selected stream by audio extension:', audioMedia.ext);
        }
      }
    }

    if (!audioMedia) {
      console.error('No suitable media found for audio extraction.');
      console.log('Available media streams debug info:', videoData.medias?.map((m: any) => ({
        ext: m.ext,
        acodec: m.acodec,
        vcodec: m.vcodec,
        is_audio: m.is_audio,
        type: m.type,
        hasUrl: hasValidUrl(m)
      })));
      
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