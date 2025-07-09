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

    // Generate a unique filename for the temporary audio file
    const tempFileName = `audio_${Date.now()}.${format}`;
    const tempFilePath = `/tmp/${tempFileName}`;
    const infoFilePath = `/tmp/info_${Date.now()}.json`;

    console.log('Extracting audio to:', tempFilePath);

    // First, get video information using yt-dlp directly
    console.log('Getting video information...');
    let videoInfo;
    try {
      const infoCommand = new Deno.Command("yt-dlp", {
        args: [
          "--dump-json",
          "--no-warnings",
          "--no-playlist",
          url
        ],
        stdout: "piped",
        stderr: "piped"
      });

      const infoProcess = infoCommand.spawn();
      const infoOutput = await infoProcess.output();

      if (!infoOutput.success) {
        const errorText = new TextDecoder().decode(infoOutput.stderr);
        console.error('Failed to get video info:', errorText);
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to retrieve video information. The video may be private, restricted, or unavailable.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const infoText = new TextDecoder().decode(infoOutput.stdout);
      videoInfo = JSON.parse(infoText);
      console.log('Video info retrieved:', videoInfo.title);
    } catch (error) {
      console.error('Failed to get video info:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to retrieve video information. The video may be private, restricted, or unavailable.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Extract audio using yt-dlp directly
    try {
      const command = new Deno.Command("yt-dlp", {
        args: [
          url,
          "--extract-audio",
          "--audio-format", format,
          "--audio-quality", "0", // Best quality
          "--output", tempFilePath,
          "--no-playlist",
          "--no-warnings"
        ],
        stdout: "piped",
        stderr: "piped"
      });

      const process = command.spawn();
      const output = await process.output();

      if (!output.success) {
        const errorText = new TextDecoder().decode(output.stderr);
        console.error('Audio extraction failed:', errorText);
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to extract audio from video. The video may have restrictions or no audio track.'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      console.log('Audio extraction completed');
    } catch (error) {
      console.error('Audio extraction failed:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to extract audio from video. The video may have restrictions or no audio track.'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Read the extracted audio file
    let audioData;
    try {
      audioData = await Deno.readFile(tempFilePath);
      console.log('Audio file read successfully, size:', audioData.length, 'bytes');
    } catch (error) {
      console.error('Failed to read audio file:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to read extracted audio file.'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Clean up temporary files
    try {
      await Deno.remove(tempFilePath);
    } catch (error) {
      console.warn('Failed to clean up temporary file:', error);
    }

    // Create response with audio data
    const mimeType = format === 'mp3' ? 'audio/mpeg' : 
                    format === 'wav' ? 'audio/wav' :
                    format === 'aac' ? 'audio/aac' :
                    format === 'ogg' ? 'audio/ogg' :
                    'audio/mpeg';

    // Return the audio file directly
    return new Response(audioData, {
      headers: {
        ...corsHeaders,
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${videoInfo.title?.replace(/[<>:"/\\|?*]/g, '') || 'audio'}.${format}"`,
        'Content-Length': audioData.length.toString(),
        'X-Video-Title': videoInfo.title || 'Unknown Title',
        'X-Video-Author': videoInfo.uploader || 'Unknown Author',
        'X-Video-Duration': videoInfo.duration?.toString() || '0',
        'X-Video-Thumbnail': videoInfo.thumbnail || ''
      }
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