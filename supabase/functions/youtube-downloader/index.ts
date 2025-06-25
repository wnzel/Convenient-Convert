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

    // MP3-focused audio stream selection
    let audioMedia = null
    if (videoData.medias && Array.isArray(videoData.medias)) {
      
      // Strategy 1: Look for any stream that can be converted to MP3
      // This includes audio-only streams and video streams with audio tracks
      const potentialAudioStreams = videoData.medias.filter((media: any) => {
        const hasUrl = media.url && media.url.length > 0
        
        // Accept streams that have audio content
        const hasAudioCodec = media.acodec && media.acodec !== 'none'
        const isAudioOnly = media.is_audio === true || media.type === 'audio'
        const isVideoWithAudio = media.vcodec && media.vcodec !== 'none' && hasAudioCodec
        const hasAudioExtension = media.extension && ['mp3', 'aac', 'm4a', 'ogg', 'wav', 'flac', 'opus', 'webm', 'mp4'].includes(media.extension.toLowerCase())
        
        const canExtractAudio = hasAudioCodec || isAudioOnly || isVideoWithAudio || hasAudioExtension
        
        return hasUrl && canExtractAudio
      })

      console.log('Found potential audio streams for MP3:', potentialAudioStreams.length)

      if (potentialAudioStreams.length > 0) {
        // Sort by preference for MP3 extraction
        potentialAudioStreams.sort((a: any, b: any) => {
          // Prefer audio-only streams
          const aIsAudioOnly = a.is_audio === true || a.type === 'audio' || (!a.vcodec || a.vcodec === 'none')
          const bIsAudioOnly = b.is_audio === true || b.type === 'audio' || (!b.vcodec || b.vcodec === 'none')
          
          if (aIsAudioOnly && !bIsAudioOnly) return -1
          if (!aIsAudioOnly && bIsAudioOnly) return 1
          
          // Prefer formats that are easier to convert to MP3
          const mp3FriendlyFormats = ['m4a', 'aac', 'mp3', 'ogg', 'wav']
          const aIsMp3Friendly = mp3FriendlyFormats.includes(a.extension?.toLowerCase() || '')
          const bIsMp3Friendly = mp3FriendlyFormats.includes(b.extension?.toLowerCase() || '')
          
          if (aIsMp3Friendly && !bIsMp3Friendly) return -1
          if (!aIsMp3Friendly && bIsMp3Friendly) return 1
          
          // Prefer higher quality
          const aBitrate = parseInt(a.abr || a.bitrate || a.tbr || '0')
          const bBitrate = parseInt(b.abr || b.bitrate || b.tbr || '0')
          return bBitrate - aBitrate
        })

        audioMedia = potentialAudioStreams[0]
        console.log('Selected media for MP3 conversion:', {
          extension: audioMedia.extension,
          acodec: audioMedia.acodec,
          vcodec: audioMedia.vcodec,
          quality: audioMedia.quality,
          abr: audioMedia.abr,
          isAudioOnly: audioMedia.is_audio === true || audioMedia.type === 'audio'
        })
      }

      // Fallback: try any stream with a URL
      if (!audioMedia) {
        console.log('No suitable audio streams found, trying fallback...')
        audioMedia = videoData.medias.find((media: any) => media.url && media.url.length > 0)
        
        if (audioMedia) {
          console.log('Using fallback media for MP3 conversion:', {
            extension: audioMedia.extension,
            acodec: audioMedia.acodec,
            vcodec: audioMedia.vcodec
          })
        }
      }
    }

    if (!audioMedia) {
      console.error('No suitable media found for MP3 extraction')
      
      // Log available medias for debugging
      if (videoData.medias && Array.isArray(videoData.medias)) {
        console.log('Available medias:')
        videoData.medias.forEach((media: any, index: number) => {
          console.log(`Media ${index}:`, {
            extension: media.extension,
            acodec: media.acodec,
            vcodec: media.vcodec,
            type: media.type,
            is_audio: media.is_audio,
            hasUrl: !!media.url
          })
        })
      }
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No audio format available for this video. The video may be restricted, have no audio track, or be unavailable for download.',
          debug: {
            totalMedias: videoData.medias?.length || 0,
            videoTitle: videoData.title,
            hasMediasArray: Array.isArray(videoData.medias),
            mediasWithUrls: videoData.medias?.filter((m: any) => m.url && m.url.length > 0).length || 0
          }
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