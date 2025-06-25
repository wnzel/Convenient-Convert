const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface YouTubeRequest {
  url: string;
  format?: string;
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
    const { url, format = 'mp3' }: YouTubeRequest = await req.json()

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

    // Get Apify token from environment
    const apifyToken = Deno.env.get('APIFY_TOKEN')
    if (!apifyToken) {
      console.error('APIFY_TOKEN environment variable is not set')
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

    console.log('Starting Apify actor with input:', JSON.stringify(runInput))

    // Start the Apify actor with timeout
    const runResponse = await Promise.race([
      fetch(`https://api.apify.com/v2/acts/jvDjDIPtCZAcZo9jb/runs?token=${apifyToken}`, {
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

    // Wait for the run to complete with shorter intervals and better error handling
    let attempts = 0
    const maxAttempts = 120 // 10 minutes timeout (5 second intervals)
    let runStatus = 'RUNNING'
    let lastError = null

    while (runStatus === 'RUNNING' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
      
      try {
        const statusResponse = await Promise.race([
          fetch(`https://api.apify.com/v2/acts/jvDjDIPtCZAcZo9jb/runs/${runId}?token=${apifyToken}`),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout checking run status')), 10000)
          )
        ])
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json()
          runStatus = statusData.data.status
          console.log(`Run status check ${attempts + 1}/${maxAttempts}: ${runStatus}`)
          
          // Log additional details if available
          if (statusData.data.stats) {
            console.log('Run stats:', statusData.data.stats)
          }
        } else {
          console.error('Failed to check run status:', statusResponse.status)
          lastError = `Status check failed: ${statusResponse.status}`
        }
      } catch (error) {
        console.error('Error checking run status:', error)
        lastError = error instanceof Error ? error.message : 'Unknown error checking status'
      }
      
      attempts++
    }

    if (runStatus !== 'SUCCEEDED') {
      console.error('Apify run failed or timed out. Final status:', runStatus)
      console.error('Last error:', lastError)
      
      // Try to get run details for more info
      try {
        const runDetailsResponse = await fetch(`https://api.apify.com/v2/acts/jvDjDIPtCZAcZo9jb/runs/${runId}?token=${apifyToken}`)
        if (runDetailsResponse.ok) {
          const runDetails = await runDetailsResponse.json()
          console.error('Run details:', JSON.stringify(runDetails.data, null, 2))
        }
      } catch (e) {
        console.error('Failed to get run details:', e)
      }
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Download process failed. Status: ${runStatus}. ${lastError || ''}`,
          debug: {
            runId,
            finalStatus: runStatus,
            attempts,
            lastError
          }
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Apify run completed successfully, fetching results...')

    // Get the dataset ID and fetch results with timeout
    const runDetailsResponse = await Promise.race([
      fetch(`https://api.apify.com/v2/acts/jvDjDIPtCZAcZo9jb/runs/${runId}?token=${apifyToken}`),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout fetching run details')), 15000)
      )
    ])
    
    if (!runDetailsResponse.ok) {
      console.error('Failed to get run details:', runDetailsResponse.status)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Failed to get run details' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    const runDetails = await runDetailsResponse.json()
    const datasetId = runDetails.data.defaultDatasetId
    console.log('Dataset ID:', datasetId)

    // Fetch the results from the dataset with timeout
    const resultsResponse = await Promise.race([
      fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}`),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout fetching results')), 15000)
      )
    ])
    
    if (!resultsResponse.ok) {
      console.error('Failed to fetch results:', resultsResponse.status)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Failed to fetch results' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    const results = await resultsResponse.json()
    console.log('Results fetched, count:', results.length)

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
    console.log('Video data keys:', Object.keys(videoData))
    console.log('Video title:', videoData.title)
    console.log('Video medias count:', videoData.medias?.length || 0)

    // Enhanced audio stream selection logic
    let audioMedia = null
    if (videoData.medias && Array.isArray(videoData.medias)) {
      console.log('Processing medias array...')
      
      // Look for audio streams with more flexible criteria
      const audioStreams = videoData.medias.filter((media: any) => {
        const hasUrl = media.url && media.url.length > 0
        const isAudio = media.is_audio === true || 
                       media.type === 'audio' ||
                       (media.acodec && media.acodec !== 'none') ||
                       (media.extension && ['mp3', 'aac', 'm4a', 'ogg', 'wav', 'flac', 'opus'].includes(media.extension.toLowerCase())) ||
                       (!media.vcodec || media.vcodec === 'none')
        
        console.log(`Media check - URL: ${!!hasUrl}, Audio: ${isAudio}, Extension: ${media.extension}, ACodec: ${media.acodec}, VCodec: ${media.vcodec}`)
        
        return hasUrl && isAudio
      })

      console.log('Found audio streams:', audioStreams.length)

      if (audioStreams.length > 0) {
        // Sort by preference: exact format match, then quality
        audioStreams.sort((a: any, b: any) => {
          const aMatchesFormat = a.extension?.toLowerCase() === format.toLowerCase()
          const bMatchesFormat = b.extension?.toLowerCase() === format.toLowerCase()
          
          if (aMatchesFormat && !bMatchesFormat) return -1
          if (!aMatchesFormat && bMatchesFormat) return 1
          
          // Sort by quality/bitrate
          const aBitrate = parseInt(a.abr || a.bitrate || a.tbr || '0')
          const bBitrate = parseInt(b.abr || b.bitrate || b.tbr || '0')
          return bBitrate - aBitrate
        })

        audioMedia = audioStreams[0]
        console.log('Selected audio media:', {
          extension: audioMedia.extension,
          quality: audioMedia.quality,
          acodec: audioMedia.acodec,
          abr: audioMedia.abr
        })
      } else {
        // Log all available medias for debugging
        console.log('No audio streams found. Available medias:')
        videoData.medias.forEach((media: any, index: number) => {
          console.log(`Media ${index}:`, {
            extension: media.extension,
            acodec: media.acodec,
            vcodec: media.vcodec,
            type: media.type,
            is_audio: media.is_audio,
            quality: media.quality,
            hasUrl: !!media.url
          })
        })
      }
    } else {
      console.log('No medias array found or it is not an array')
    }

    if (!audioMedia) {
      console.error('No suitable audio media found')
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No audio format available for this video',
          debug: {
            totalMedias: videoData.medias?.length || 0,
            videoTitle: videoData.title,
            requestedFormat: format,
            availableFormats: videoData.medias?.map((m: any) => m.extension).filter(Boolean) || []
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

    console.log('Returning successful response for:', videoData.title)

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