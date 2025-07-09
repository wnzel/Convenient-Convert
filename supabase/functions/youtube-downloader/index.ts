const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface RequestBody {
  url: string;
  format: string;
}

interface VideoInfo {
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
}

async function getVideoInfo(url: string): Promise<VideoInfo> {
  try {
    const command = new Deno.Command("yt-dlp", {
      args: [
        "--dump-json",
        "--no-download",
        url
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();
    
    if (code !== 0) {
      const errorText = new TextDecoder().decode(stderr);
      console.error("yt-dlp info error:", errorText);
      throw new Error("Failed to get video information");
    }

    const output = new TextDecoder().decode(stdout);
    const info = JSON.parse(output);
    
    return {
      title: info.title || "Unknown Title",
      uploader: info.uploader || "Unknown Author",
      duration: info.duration || 0,
      thumbnail: info.thumbnail || ""
    };
  } catch (error) {
    console.error("Error getting video info:", error);
    throw new Error("Failed to retrieve video information");
  }
}

async function downloadAudio(url: string, format: string = "mp3"): Promise<{ audioData: Uint8Array; info: VideoInfo }> {
  try {
    // First get video info
    const info = await getVideoInfo(url);
    
    // Create temporary directory
    const tempDir = await Deno.makeTempDir();
    const outputTemplate = `${tempDir}/%(title)s.%(ext)s`;
    
    try {
      const command = new Deno.Command("yt-dlp", {
        args: [
          "--extract-audio",
          "--audio-format", format,
          "--audio-quality", "0", // Best quality
          "--output", outputTemplate,
          "--no-playlist",
          url
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const { code, stderr } = await command.output();
      
      if (code !== 0) {
        const errorText = new TextDecoder().decode(stderr);
        console.error("yt-dlp download error:", errorText);
        throw new Error("Failed to download audio");
      }

      // Find the downloaded file
      const files = [];
      for await (const dirEntry of Deno.readDir(tempDir)) {
        if (dirEntry.isFile && dirEntry.name.endsWith(`.${format}`)) {
          files.push(dirEntry.name);
        }
      }

      if (files.length === 0) {
        throw new Error("No audio file was created");
      }

      // Read the audio file
      const audioFilePath = `${tempDir}/${files[0]}`;
      const audioData = await Deno.readFile(audioFilePath);
      
      // Clean up temp directory
      await Deno.remove(tempDir, { recursive: true });
      
      return { audioData, info };
    } catch (error) {
      // Clean up temp directory on error
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch (cleanupError) {
        console.error("Cleanup error:", cleanupError);
      }
      throw error;
    }
  } catch (error) {
    console.error("Download audio error:", error);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    const body: RequestBody = await req.json();
    const { url, format = "mp3" } = body;

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]{11,}/;
    if (!youtubeRegex.test(url)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid YouTube URL" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    // Check if yt-dlp is available
    try {
      const checkCommand = new Deno.Command("yt-dlp", {
        args: ["--version"],
        stdout: "piped",
        stderr: "piped",
      });
      const { code } = await checkCommand.output();
      
      if (code !== 0) {
        throw new Error("yt-dlp not available");
      }
    } catch (error) {
      console.error("yt-dlp check failed:", error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "YouTube audio extraction service is not properly configured. Please contact support." 
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    // Download the audio
    const { audioData, info } = await downloadAudio(url, format);
    
    // Return the audio file with metadata in headers
    return new Response(audioData, {
      status: 200,
      headers: {
        "Content-Type": `audio/${format}`,
        "Content-Disposition": `attachment; filename="${info.title.replace(/[<>:"/\\|?*]/g, '')}.${format}"`,
        "X-Video-Title": info.title,
        "X-Video-Author": info.uploader,
        "X-Video-Duration": info.duration.toString(),
        "X-Video-Thumbnail": info.thumbnail,
        ...corsHeaders,
      },
    });

  } catch (error) {
    console.error("YouTube downloader error:", error);
    
    // Provide more specific error messages
    let errorMessage = "Internal server error";
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.message.includes("Failed to get video information")) {
        errorMessage = "Unable to access video information. The video may be private, deleted, or region-restricted.";
        statusCode = 400;
      } else if (error.message.includes("Failed to download audio")) {
        errorMessage = "Failed to extract audio from the video. Please try again or check if the video is available.";
        statusCode = 400;
      } else if (error.message.includes("Invalid YouTube URL")) {
        errorMessage = "Please provide a valid YouTube URL.";
        statusCode = 400;
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      {
        status: statusCode,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
});