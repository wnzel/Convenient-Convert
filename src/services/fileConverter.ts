// Import FFmpeg utilities at the top level
let createFFmpeg: any;
let fetchFile: any;

export class FileConverterService {
  private static ffmpeg: any = null;

  private static async loadFFmpeg() {
    if (this.ffmpeg) return this.ffmpeg;
    
    // Dynamically import @ffmpeg/ffmpeg if not already imported
    if (!createFFmpeg || !fetchFile) {
      const ffmpegModule = await import('@ffmpeg/ffmpeg');
      createFFmpeg = ffmpegModule.createFFmpeg;
      fetchFile = ffmpegModule.fetchFile;
    }
    
    this.ffmpeg = createFFmpeg({
      log: false,
      corePath: 'https://unpkg.com/@ffmpeg/core@0.10.0/dist/ffmpeg-core.js',
    });
    
    if (!this.ffmpeg.isLoaded()) {
      await this.ffmpeg.load();
    }
    
    return this.ffmpeg;
  }

  static async convertFile(
    file: File, 
    targetFormat: string, 
    targetSize?: number,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    const ffmpeg = await this.loadFFmpeg();
    
    // Update progress
    onProgress?.(10);
    
    const inputName = `input.${file.name.split('.').pop()}`;
    const outputName = `output.${targetFormat}`;
    
    // Write input file
    ffmpeg.FS('writeFile', inputName, await fetchFile(file));
    onProgress?.(20);
    
    // Determine conversion parameters based on file type and target size
    const conversionArgs = this.getConversionArgs(file, targetFormat, targetSize);
    
    onProgress?.(30);
    
    // Run conversion
    await ffmpeg.run('-i', inputName, ...conversionArgs, outputName);
    onProgress?.(80);
    
    // Read output file
    const data = ffmpeg.FS('readFile', outputName);
    onProgress?.(90);
    
    // Clean up
    ffmpeg.FS('unlink', inputName);
    ffmpeg.FS('unlink', outputName);
    
    onProgress?.(100);
    
    // Create blob with appropriate MIME type
    const mimeType = this.getMimeType(targetFormat);
    return new Blob([data.buffer], { type: mimeType });
  }

  private static getConversionArgs(file: File, targetFormat: string, targetSize?: number): string[] {
    const fileType = this.getFileType(file);
    
    if (fileType === 'video') {
      return this.getVideoConversionArgs(file, targetFormat, targetSize);
    } else if (fileType === 'audio') {
      return this.getAudioConversionArgs(file, targetFormat, targetSize);
    } else if (fileType === 'image') {
      return this.getImageConversionArgs(file, targetFormat, targetSize);
    }
    
    return [];
  }

  private static getVideoConversionArgs(file: File, targetFormat: string, targetSize?: number): string[] {
    const args: string[] = [];
    
    if (targetSize) {
      // Calculate target bitrate based on file size
      // Assuming average video length of 60 seconds for estimation
      const targetBitrate = Math.floor((targetSize * 8 * 1024) / 60); // kbps
      
      args.push(
        '-c:v', 'libx264',
        '-b:v', `${Math.floor(targetBitrate * 0.8)}k`, // 80% for video
        '-c:a', 'aac',
        '-b:a', `${Math.floor(targetBitrate * 0.2)}k`, // 20% for audio
        '-preset', 'medium',
        '-crf', '28'
      );
    } else {
      args.push('-c:v', 'libx264', '-c:a', 'aac', '-preset', 'medium');
    }
    
    // Format-specific settings
    if (targetFormat === 'mp4') {
      args.push('-f', 'mp4');
    } else if (targetFormat === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-c:a', 'libopus', '-f', 'webm');
    } else if (targetFormat === 'avi') {
      args.push('-f', 'avi');
    }
    
    return args;
  }

  private static getAudioConversionArgs(file: File, targetFormat: string, targetSize?: number): string[] {
    const args: string[] = [];
    
    if (targetSize) {
      // Calculate target bitrate for audio
      // Estimate duration (assume 3 minutes average for calculation)
      const estimatedDuration = 180; // seconds
      const targetBitrate = Math.floor((targetSize * 8 * 1024) / estimatedDuration); // bps
      const targetKbps = Math.min(320, Math.max(64, Math.floor(targetBitrate / 1000))); // Clamp between 64-320 kbps
      
      args.push('-b:a', `${targetKbps}k`);
    }
    
    // Format-specific settings
    if (targetFormat === 'mp3') {
      args.push('-c:a', 'libmp3lame');
    } else if (targetFormat === 'aac') {
      args.push('-c:a', 'aac');
    } else if (targetFormat === 'ogg') {
      args.push('-c:a', 'libvorbis');
    } else if (targetFormat === 'wav') {
      args.push('-c:a', 'pcm_s16le');
    }
    
    return args;
  }

  private static getImageConversionArgs(file: File, targetFormat: string, targetSize?: number): string[] {
    const args: string[] = [];
    
    if (targetSize && (targetFormat === 'jpg' || targetFormat === 'jpeg')) {
      // For JPEG, use quality setting to control file size
      const quality = targetSize < 1 ? 60 : targetSize < 5 ? 75 : 85;
      args.push('-q:v', quality.toString());
    } else if (targetSize && targetFormat === 'png') {
      // For PNG, use compression level
      args.push('-compression_level', '9');
    }
    
    // Format-specific settings
    if (targetFormat === 'jpg' || targetFormat === 'jpeg') {
      args.push('-f', 'image2', '-vcodec', 'mjpeg');
    } else if (targetFormat === 'png') {
      args.push('-f', 'image2', '-vcodec', 'png');
    } else if (targetFormat === 'webp') {
      args.push('-f', 'webp', '-c:v', 'libwebp');
      if (targetSize) {
        const quality = targetSize < 1 ? 60 : targetSize < 5 ? 75 : 85;
        args.push('-quality', quality.toString());
      }
    }
    
    return args;
  }

  private static getFileType(file: File): 'video' | 'audio' | 'image' | 'document' {
    const mimeType = file.type.toLowerCase();
    
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
    return 'document';
  }

  private static getMimeType(format: string): string {
    const mimeTypes: { [key: string]: string } = {
      // Video
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'avi': 'video/x-msvideo',
      'mov': 'video/quicktime',
      'mkv': 'video/x-matroska',
      
      // Audio
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'aac': 'audio/aac',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac',
      'm4a': 'audio/mp4',
      
      // Image
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
    };
    
    return mimeTypes[format.toLowerCase()] || 'application/octet-stream';
  }

  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}