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
    console.log('Video data received:', videoData)

    // Find the best audio format using more robust filtering
    let audioMedia = null
    if (videoData.medias && Array.isArray(videoData.medias)) {
      // Filter for audio streams using codec information
      const audioStreams = videoData.medias.filter((media: any) => {
        // Check if it has an audio codec and either no video codec, video codec is 'none', or 'unknown'
        return media.acodec && 
               media.acodec !== 'none' && 
               (!media.vcodec || media.vcodec === 'none' || media.vcodec === 'unknown')
      })

      // If no audio-only streams found, try alternative filtering
      if (audioStreams.length === 0) {
        // Fallback: look for streams marked as audio type or with audio extensions
        const fallbackAudioStreams = videoData.medias.filter((media: any) => {
          return (media.is_audio === true) || 
                 (media.type === 'audio') ||
                 (media.extension && ['mp3', 'aac', 'm4a', 'ogg', 'wav'].includes(media.extension.toLowerCase()))
        })
        audioStreams.push(...fallbackAudioStreams)
      }

      console.log('Found audio streams:', audioStreams.length)

      if (audioStreams.length > 0) {
        // Look for the requested format first
        audioMedia = audioStreams.find((media: any) => 
          media.extension?.toLowerCase() === format.toLowerCase()
        )
        
        // If not found, get the best quality audio stream
        if (!audioMedia) {
          // Sort by quality/bitrate if available, otherwise take the first one
          audioStreams.sort((a: any, b: any) => {
            const aBitrate = parseInt(a.abr || a.bitrate || '0')
            const bBitrate = parseInt(b.abr || b.bitrate || '0')
            return bBitrate - aBitrate // Descending order (highest quality first)
          })
          audioMedia = audioStreams[0]
        }
      }
    }

    if (!audioMedia) {
      console.error('No audio media found. Available medias:', videoData.medias)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No audio format available for this video' 
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