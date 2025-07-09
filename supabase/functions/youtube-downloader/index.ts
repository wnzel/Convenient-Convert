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

    // --- Get video info using yt-dlp ---
    const infoCommand = new Deno.Command("python3", {
      args: [
        "-c",
        `
import yt_dlp
import json
import sys

try:
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info('${url}', download=False)
        
        # Extract relevant information
        video_info = {
            'title': info.get('title', 'Unknown Title'),
            'uploader': info.get('uploader', 'Unknown Author'),
            'duration': info.get('duration', 0),
            'thumbnail': info.get('thumbnail', ''),
            'id': info.get('id', ''),
        }
        
        print(json.dumps(video_info))
        
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
        `
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const infoProcess = infoCommand.spawn();
    const infoOutput = await infoProcess.output();

    if (!infoOutput.success) {
      const errorText = new TextDecoder().decode(infoOutput.stderr);
      console.error('yt-dlp info extraction failed:', errorText);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to extract video information. The video may be private, restricted, or unavailable.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const infoText = new TextDecoder().decode(infoOutput.stdout);
    let videoInfo;
    
    try {
      videoInfo = JSON.parse(infoText);
    } catch (e) {
      console.error('Failed to parse video info:', infoText);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to parse video information'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (videoInfo.error) {
      return new Response(JSON.stringify({
        success: false,
        error: videoInfo.error
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Video info extracted:', videoInfo.title);

    // --- Download audio using yt-dlp ---
    const outputPath = `/tmp/audio_${videoInfo.id}.${format}`;
    
    const downloadCommand = new Deno.Command("python3", {
      args: [
        "-c",
        `
import yt_dlp
import sys

try:
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': '${outputPath}',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': '${format}',
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download(['${url}'])
        
    print('Download completed successfully')
        
except Exception as e:
    print(f'Download failed: {str(e)}', file=sys.stderr)
    sys.exit(1)
        `
      ],
      stdout: "piped",
      stderr: "piped",
    });

    console.log('Starting audio download...');
    const downloadProcess = downloadCommand.spawn();
    const downloadOutput = await downloadProcess.output();

    if (!downloadOutput.success) {
      const errorText = new TextDecoder().decode(downloadOutput.stderr);
      console.error('yt-dlp download failed:', errorText);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to download audio. The video may be restricted or unavailable for download.'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Audio download completed');

    // --- Read the downloaded file ---
    let audioData;
    try {
      audioData = await Deno.readFile(outputPath);
    } catch (e) {
      console.error('Failed to read downloaded file:', e);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to read downloaded audio file'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Clean up the temporary file ---
    try {
      await Deno.remove(outputPath);
    } catch (e) {
      console.warn('Failed to clean up temporary file:', e);
    }

    // --- Return the audio file ---
    const mimeType = format === 'mp3' ? 'audio/mpeg' : `audio/${format}`;
    
    return new Response(audioData, {
      headers: {
        ...corsHeaders,
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${videoInfo.title.replace(/[<>:"/\\|?*]/g, '')}.${format}"`,
        'X-Video-Title': videoInfo.title,
        'X-Video-Author': videoInfo.uploader,
        'X-Video-Duration': videoInfo.duration.toString(),
        'X-Video-Thumbnail': videoInfo.thumbnail,
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