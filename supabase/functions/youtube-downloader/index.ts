const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface YouTubeRequest {
  url: string;
  format?: string;
  apifyToken?: string;
}

interface ApifyRunInput {
  links: string[];
  proxyConfiguration: {
    useApifyProxy: boolean;
    apifyProxyGroups: string[];
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url, format = 'mp3', apifyToken }: YouTubeRequest = await req.json()

    if (!url) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'YouTube URL is required' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]+/
    if (!youtubeRegex.test(url)) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Invalid YouTube URL' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get Apify token from request body or environment
    const finalApifyToken = apifyToken || Deno.env.get('APIFY_TOKEN')
    if (!finalApifyToken) {
      console.error('APIFY_TOKEN not provided in request and not set in environment')
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'APIFY_TOKEN not configured' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Prepare the Actor input
    const runInput: ApifyRunInput = {
      links: [url],
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
    }

    console.log('Starting Apify actor for MP3 extraction:', JSON.stringify(runInput))

    // Start the Apify actor with timeout
    const runResponse = await Promise.race([
      fetch(`https://api.apify.com/v2/acts/jvDjDIPtCZAcZo9jb/runs?token=${finalApifyToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(runInput),
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout starting Apify actor')), 30000)
      )
    ])

    if (!runResponse.ok) {
      const errorText = await runResponse.text()
      console.error('Failed to start Apify actor:', runResponse.status, errorText)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Failed to start download process: ${runResponse.status} ${errorText}` 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const runData = await runResponse.json()
    const runId = runData.data.id
    console.log('Apify run started with ID:', runId)

    // Wait for the run to complete
    let attempts = 0
    const maxAttempts = 120 // 10 minutes timeout
    let runStatus = 'RUNNING'

    while (runStatus === 'RUNNING' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
      
      try {
        const statusResponse = await fetch(`https://api.apify.com/v2/acts/jvDjDIPtCZAcZo9jb/runs/${runId}?token=${finalApifyToken}`)
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json()
          runStatus = statusData.data.status
          console.log(`Run status check ${attempts + 1}/${maxAttempts}: ${runStatus}`)
        }
      } catch (error) {
        console.error('Error checking run status:', error)
      }
      
      attempts++
    }

    if (runStatus !== 'SUCCEEDED') {
      console.error('Apify run failed or timed out. Final status:', runStatus)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Download process failed. Status: ${runStatus}`,
          debug: { runId, finalStatus: runStatus, attempts }
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Apify run completed successfully, fetching results...')

    // Get the dataset ID and fetch results
    const runDetailsResponse = await fetch(`https://api.apify.com/v2/acts/jvDjDIPtCZAcZo9jb/runs/${runId}?token=${finalApifyToken}`)
    const runDetails = await runDetailsResponse.json()
    const datasetId = runDetails.data.defaultDatasetId

    // Fetch the results from the dataset
    const resultsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${finalApifyToken}`)
    const results = await resultsResponse.json()

    if (!results || results.length === 0) {
      console.error('No results found in dataset')
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No results found',
          debug: { datasetId, runId }
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const videoData = results[0]
    console.log('Video data received for MP3 extraction:', videoData.title)
    console.log('Available medias count:', videoData.medias?.length || 0)

    // Enhanced audio stream selection with multiple fallback strategies
    let audioMedia = null
    
    // Helper function to check if a media has a valid URL
    const hasValidUrl = (media: any) => media.url && typeof media.url === 'string' && media.url.trim().length > 0

    if (videoData.medias && Array.isArray(videoData.medias)) {
      console.log('Analyzing available media streams...')
      
      // Log all available medias for debugging
      videoData.medias.forEach((media: any, index: number) => {
        console.log(`Media ${index}:`, {
          extension: media.extension,
          acodec: media.acodec,
          vcodec: media.vcodec,
          type: media.type,
          is_audio: media.is_audio,
          hasUrl: hasValidUrl(media),
          quality: media.quality,
          abr: media.abr,
          format_id: media.format_id
        })
      })

      // Strategy 1: Look for explicit audio-only streams
      const audioOnlyStreams = videoData.medias.filter((media: any) => {
        return hasValidUrl(media) && (
          media.is_audio === true ||
          media.type === 'audio' ||
          (media.vcodec === 'none' && media.acodec && media.acodec !== 'none') ||
          ['m4a', 'mp3', 'aac', 'ogg', 'wav', 'flac', 'opus'].includes(media.extension?.toLowerCase())
        )
      })

      if (audioOnlyStreams.length > 0) {
        console.log('Found audio-only streams:', audioOnlyStreams.length)
        // Sort by quality preference
        audioOnlyStreams.sort((a: any, b: any) => {
          const aBitrate = parseInt(a.abr || a.bitrate || a.tbr || '0')
          const bBitrate = parseInt(b.abr || b.bitrate || b.tbr || '0')
          return bBitrate - aBitrate
        })
        audioMedia = audioOnlyStreams[0]
        console.log('Selected audio-only stream:', audioMedia.extension, audioMedia.abr)
      }

      // Strategy 2: Look for streams with audio codecs (including video+audio)
      if (!audioMedia) {
        const streamsWithAudio = videoData.medias.filter((media: any) => {
          return hasValidUrl(media) && media.acodec && media.acodec !== 'none'
        })

        if (streamsWithAudio.length > 0) {
          console.log('Found streams with audio codecs:', streamsWithAudio.length)
          // Prefer streams with better audio quality
          streamsWithAudio.sort((a: any, b: any) => {
            // Prefer audio-only over video+audio
            const aIsAudioOnly = !a.vcodec || a.vcodec === 'none'
            const bIsAudioOnly = !b.vcodec || b.vcodec === 'none'
            
            if (aIsAudioOnly && !bIsAudioOnly) return -1
            if (!aIsAudioOnly && bIsAudioOnly) return 1
            
            // Then by audio bitrate
            const aBitrate = parseInt(a.abr || a.bitrate || a.tbr || '0')
            const bBitrate = parseInt(b.abr || b.bitrate || b.tbr || '0')
            return bBitrate - aBitrate
          })
          audioMedia = streamsWithAudio[0]
          console.log('Selected stream with audio codec:', audioMedia.extension, audioMedia.acodec)
        }
      }

      // Strategy 3: Look for any stream that's not explicitly video-only
      if (!audioMedia) {
        const nonVideoOnlyStreams = videoData.medias.filter((media: any) => {
          return hasValidUrl(media) && !(
            media.type === 'video' && 
            media.acodec === 'none' && 
            media.vcodec && media.vcodec !== 'none'
          )
        })

        if (nonVideoOnlyStreams.length > 0) {
          console.log('Found non-video-only streams:', nonVideoOnlyStreams.length)
          audioMedia = nonVideoOnlyStreams[0]
          console.log('Selected non-video-only stream:', audioMedia.extension)
        }
      }

      // Strategy 4: Use any stream with a valid URL as last resort
      if (!audioMedia) {
        const anyValidStream = videoData.medias.find((media: any) => hasValidUrl(media))
        if (anyValidStream) {
          console.log('Using fallback: any valid stream')
          audioMedia = anyValidStream
        }
      }

      // Strategy 5: Check if there's a direct video URL we can use
      if (!audioMedia && videoData.url && typeof videoData.url === 'string' && videoData.url.trim().length > 0) {
        console.log('Using main video URL as fallback')
        audioMedia = {
          url: videoData.url,
          extension: 'mp4',
          acodec: 'unknown',
          vcodec: 'unknown',
          quality: 'standard'
        }
      }
    }

    if (!audioMedia) {
      console.error('No suitable media found for MP3 extraction after all strategies')
      
      // Enhanced debugging information
      const debugInfo = {
        totalMedias: videoData.medias?.length || 0,
        videoTitle: videoData.title,
        hasMediasArray: Array.isArray(videoData.medias),
        hasMainUrl: !!(videoData.url && typeof videoData.url === 'string' && videoData.url.trim().length > 0),
        mediasWithUrls: videoData.medias?.filter((m: any) => hasValidUrl(m)).length || 0,
        mediaTypes: videoData.medias?.map((m: any) => ({
          type: m.type,
          extension: m.extension,
          hasUrl: hasValidUrl(m),
          acodec: m.acodec,
          vcodec: m.vcodec
        })) || []
      }
      
      console.log('Debug info:', JSON.stringify(debugInfo, null, 2))
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No audio format available for this video. The video may be restricted, have no audio track, or be unavailable for download.',
          debug: debugInfo
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Return the download information - always specify MP3 as the target format
    const response = {
      success: true,
      data: {
        title: videoData.title || 'Unknown Title',
        author: videoData.author || 'Unknown Author',
        duration: videoData.duration || 0,
        thumbnail: videoData.thumbnail || '',
        downloadUrl: audioMedia.url,
        format: 'mp3', // Always return MP3 as the target format
        quality: audioMedia.quality || audioMedia.abr || audioMedia.bitrate || 'standard',
        sourceFormat: audioMedia.extension || 'unknown', // Include source format for reference
        hasAudioCodec: !!(audioMedia.acodec && audioMedia.acodec !== 'none'),
        isAudioOnly: audioMedia.is_audio === true || audioMedia.type === 'audio' || (!audioMedia.vcodec || audioMedia.vcodec === 'none')
      }
    }

    console.log('Returning successful MP3 extraction response for:', videoData.title)
    console.log('Selected media details:', {
      url: audioMedia.url ? 'present' : 'missing',
      extension: audioMedia.extension,
      acodec: audioMedia.acodec,
      vcodec: audioMedia.vcodec
    })

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('YouTube MP3 downloader error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error during MP3 extraction',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})