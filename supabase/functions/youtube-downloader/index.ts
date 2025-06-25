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

    // Get Apify token from environment or request
    const finalApifyToken = Deno.env.get('APIFY_TOKEN') || apifyToken
    if (!finalApifyToken) {
      console.error('APIFY_TOKEN environment variable is not set and no token provided in request')
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'APIFY_TOKEN not configured. Please provide an Apify token.' 
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

    console.log('Starting Apify actor with input:', runInput)

    // Start the Apify actor
    const runResponse = await fetch(`https://api.apify.com/v2/acts/jvDjDIPtCZAcZo9jb/runs?token=${finalApifyToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(runInput),
    })

    if (!runResponse.ok) {
      const errorText = await runResponse.text()
      console.error('Failed to start Apify actor:', errorText)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Failed to start download process' 
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

    // Wait for the run to complete (with timeout)
    let attempts = 0
    const maxAttempts = 60 // 5 minutes timeout (5 second intervals)
    let runStatus = 'RUNNING'

    while (runStatus === 'RUNNING' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
      
      const statusResponse = await fetch(`https://api.apify.com/v2/acts/jvDjDIPtCZAcZo9jb/runs/${runId}?token=${finalApifyToken}`)
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        runStatus = statusData.data.status
        console.log('Run status:', runStatus)
      }
      
      attempts++
    }

    if (runStatus !== 'SUCCEEDED') {
      console.error('Apify run failed or timed out. Status:', runStatus)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Download process failed or timed out' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get the dataset ID and fetch results
    const runDetailsResponse = await fetch(`https://api.apify.com/v2/acts/jvDjDIPtCZAcZo9jb/runs/${runId}?token=${finalApifyToken}`)
    const runDetails = await runDetailsResponse.json()
    const datasetId = runDetails.data.defaultDatasetId

    // Fetch the results from the dataset
    const resultsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${finalApifyToken}`)
    const results = await resultsResponse.json()

    if (!results || results.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No results found' 
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const videoData = results[0]
    console.log('Full video data structure:', JSON.stringify(videoData, null, 2))

    // Log the medias array structure for debugging
    if (videoData.medias && Array.isArray(videoData.medias)) {
      console.log('Total medias found:', videoData.medias.length)
      console.log('First few medias:', JSON.stringify(videoData.medias.slice(0, 3), null, 2))
    } else {
      console.log('No medias array found or it is not an array')
    }

    // Enhanced audio stream selection logic
    let audioMedia = null
    if (videoData.medias && Array.isArray(videoData.medias)) {
      // Define recognized audio extensions and codecs
      const audioExtensions = ['mp3', 'aac', 'm4a', 'ogg', 'wav', 'flac', 'opus', 'wma', 'webm']
      const audioCodecs = ['mp3', 'aac', 'vorbis', 'opus', 'flac', 'mp4a']
      
      // More comprehensive audio stream detection
      const potentialAudioStreams = videoData.medias.filter((media: any) => {
        // Log each media for debugging
        console.log('Checking media:', {
          extension: media.extension,
          acodec: media.acodec,
          vcodec: media.vcodec,
          format: media.format,
          type: media.type,
          is_audio: media.is_audio,
          quality: media.quality,
          url: media.url ? 'present' : 'missing'
        })

        // Multiple ways to identify audio streams
        const conditions = {
          hasAudioCodec: media.acodec && media.acodec !== 'none' && audioCodecs.some(codec => 
            media.acodec.toLowerCase().includes(codec)
          ),
          isAudioOnly: !media.vcodec || media.vcodec === 'none' || media.vcodec === 'unknown',
          isMarkedAsAudio: media.is_audio === true || media.type === 'audio',
          hasAudioExtension: media.extension && audioExtensions.includes(media.extension.toLowerCase()),
          hasAudioInFormat: media.format && audioExtensions.some(ext => 
            media.format.toLowerCase().includes(ext)
          ),
          hasAudioInFormatId: media.format_id && audioExtensions.some(ext => 
            media.format_id.toLowerCase().includes(ext)
          ),
          hasValidUrl: media.url && media.url.length > 0
        }

        console.log('Media conditions:', conditions)
        
        // A stream is considered audio if it meets multiple criteria and has a valid URL
        const isAudioStream = conditions.hasValidUrl && (
          conditions.hasAudioCodec || 
          conditions.isMarkedAsAudio || 
          conditions.hasAudioExtension || 
          conditions.hasAudioInFormat ||
          conditions.hasAudioInFormatId ||
          (conditions.isAudioOnly && media.acodec)
        )

        console.log('Is audio stream:', isAudioStream)
        return isAudioStream
      })

      console.log('Found potential audio streams:', potentialAudioStreams.length)

      if (potentialAudioStreams.length > 0) {
        // Sort streams to prioritize the best quality audio
        potentialAudioStreams.sort((a: any, b: any) => {
          // First, prioritize exact format match
          const aMatchesFormat = a.extension?.toLowerCase() === format.toLowerCase()
          const bMatchesFormat = b.extension?.toLowerCase() === format.toLowerCase()
          
          if (aMatchesFormat && !bMatchesFormat) return -1
          if (!aMatchesFormat && bMatchesFormat) return 1
          
          // Then prioritize audio-only streams
          const aIsAudioOnly = !a.vcodec || a.vcodec === 'none' || a.vcodec === 'unknown'
          const bIsAudioOnly = !b.vcodec || b.vcodec === 'none' || b.vcodec === 'unknown'
          
          if (aIsAudioOnly && !bIsAudioOnly) return -1
          if (!aIsAudioOnly && bIsAudioOnly) return 1
          
          // Finally sort by quality/bitrate (highest first)
          const aBitrate = parseInt(a.abr || a.bitrate || a.tbr || '0')
          const bBitrate = parseInt(b.abr || b.bitrate || b.tbr || '0')
          return bBitrate - aBitrate
        })

        console.log('Sorted audio streams:', potentialAudioStreams.map(s => ({
          extension: s.extension,
          quality: s.quality,
          abr: s.abr,
          bitrate: s.bitrate,
          acodec: s.acodec
        })))

        // Select the best audio stream
        audioMedia = potentialAudioStreams[0]
        console.log('Selected audio media:', {
          extension: audioMedia.extension,
          quality: audioMedia.quality,
          acodec: audioMedia.acodec,
          url: audioMedia.url ? 'present' : 'missing'
        })
      }
    }

    if (!audioMedia) {
      console.error('No audio media found after filtering')
      console.error('Available medias summary:', videoData.medias?.map(m => ({
        extension: m.extension,
        acodec: m.acodec,
        vcodec: m.vcodec,
        format: m.format,
        type: m.type,
        is_audio: m.is_audio,
        hasUrl: !!m.url
      })))
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No audio format available for this video',
          debug: {
            totalMedias: videoData.medias?.length || 0,
            mediasWithUrls: videoData.medias?.filter(m => m.url).length || 0,
            requestedFormat: format
          }
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Return the download information
    const response = {
      success: true,
      data: {
        title: videoData.title || 'Unknown Title',
        author: videoData.author || 'Unknown Author',
        duration: videoData.duration || 0,
        thumbnail: videoData.thumbnail || '',
        downloadUrl: audioMedia.url,
        format: audioMedia.extension || format,
        quality: audioMedia.quality || audioMedia.abr || audioMedia.bitrate || 'standard'
      }
    }

    console.log('Returning successful response:', response)

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('YouTube downloader error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})