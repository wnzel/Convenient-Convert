import React, { useState, useRef } from "react";
import {
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  FileUp,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  YoutubeIcon,
  Download,
  XCircle,
} from "lucide-react";
import FileUploadArea from "./FileUploadArea";
import ConversionOptions from "./ConversionOptions";
import ExtractAudioForm from "./ExtractAudioForm";

export type ConversionType =
  | "audio"
  | "image"
  | "document"
  | "video"
  | "extract";

export interface FileItem {
  id: string;
  file: File;
  status: "idle" | "processing" | "completed" | "error" | "cancelled";
  type: ConversionType;
  targetFormat?: string;
  targetSize?: number;
  downloadUrl?: string;
  error?: string;
  progress: number;
}

const ConversionTool: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ConversionType>("audio");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const conversionTimers = useRef<{ [key: string]: number }>({});

  const handleAddFiles = (newFiles: FileList | null, type: ConversionType) => {
    if (!newFiles || newFiles.length === 0) return;

    const newFileItems: FileItem[] = Array.from(newFiles).map((file) => ({
      id: `${file.name}-${Date.now()}`,
      file,
      status: "idle",
      type,
      progress: 0,
    }));

    setFiles((prev) => [...prev, ...newFileItems]);
  };

  const handleRemoveFile = (id: string) => {
    if (conversionTimers.current[id]) {
      clearInterval(conversionTimers.current[id]);
      delete conversionTimers.current[id];
    }
    setFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const handleCancelConversion = (id: string) => {
    if (conversionTimers.current[id]) {
      clearInterval(conversionTimers.current[id]);
      delete conversionTimers.current[id];
    }

    setFiles((prev) =>
      prev.map((file) =>
        file.id === id
          ? { ...file, status: "cancelled", error: "Conversion cancelled" }
          : file
      )
    );
  };

  const updateFileOptions = (
    id: string,
    options: { targetFormat?: string; targetSize?: number }
  ) => {
    setFiles((prev) =>
      prev.map((file) => (file.id === id ? { ...file, ...options } : file))
    );
  };

  const handleDownload = (fileItem: FileItem) => {
    const link = document.createElement("a");
    link.href = fileItem.downloadUrl!;
    // For extracted audio, use the provided filename directly.
    if (fileItem.type === "extract") {
      link.download = fileItem.file.name;
    } else {
      link.download = `converted-${fileItem.file.name}${
        fileItem.targetFormat ? `.${fileItem.targetFormat}` : ""
      }`;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const simulateFileConversion = (fileId: string) => {
    return new Promise<void>((resolve) => {
      let progress = 0;
      conversionTimers.current[fileId] = setInterval(() => {
        progress += 2;

        setFiles((prev) =>
          prev.map((f) => (f.id === fileId ? { ...f, progress } : f))
        );

        if (progress >= 100) {
          clearInterval(conversionTimers.current[fileId]);
          delete conversionTimers.current[fileId];
          resolve();
        }
      }, 100);
    });
  };

  const handleConvert = async () => {
    setIsProcessing(true);

    setFiles((prev) =>
      prev.map((file) =>
        file.status === "idle"
          ? { ...file, status: "processing", progress: 0 }
          : file
      )
    );

    for (const file of files.filter((f) => f.status === "idle")) {
      try {
        await simulateFileConversion(file.id);

        const success = Math.random() > 0.1;

        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? {
                  ...f,
                  status: success ? "completed" : "error",
                  progress: success ? 100 : f.progress,
                  downloadUrl: success
                    ? URL.createObjectURL(f.file)
                    : undefined,
                  error: !success ? "Failed to convert file" : undefined,
                }
              : f
          )
        );
      } catch (error) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? {
                  ...f,
                  status: "error",
                  error: "Conversion failed",
                }
              : f
          )
        );
      }
    }

    setIsProcessing(false);
  };

  const handleExtractAudio = async (
    audioUrl: string,
    format: string,
    filenameFromServer?: string
  ) => {
    const fileName =
      filenameFromServer || `extracted-audio-${Date.now()}.${format}`;
    // Map common audio MIME types
    const mimeMap: Record<string, string> = {
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      wav: "audio/wav",
      flac: "audio/flac",
      ogg: "audio/ogg",
    };
    const mimeType = mimeMap[format] || "audio/mpeg";

    const newFile: FileItem = {
      id: `extract-${Date.now()}`,
      file: new File([], fileName, { type: mimeType }),
      status: "processing",
      type: "extract",
      targetFormat: format,
      progress: 0,
    };

    setFiles((prev) => [...prev, newFile]);

    try {
      // If the server returned an object URL (blob:), we can use it directly
      if (audioUrl.startsWith("blob:")) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === newFile.id
              ? {
                  ...f,
                  status: "completed",
                  progress: 100,
                  downloadUrl: audioUrl,
                }
              : f
          )
        );
      } else {
        // Download the audio file
        const response = await fetch(audioUrl);
        if (!response.ok) throw new Error("Failed to download audio");

        // Try to capture server-provided filename as a fallback (if direct URL path is used)
        let suggestedName = filenameFromServer;
        const cd =
          response.headers.get("Content-Disposition") ||
          response.headers.get("content-disposition");
        if (!suggestedName && cd) {
          const m1 = cd.match(/filename\s*=\s*"([^"]+)"/i);
          if (m1 && m1[1]) suggestedName = m1[1];
        }

        const blob = await response.blob();

        setFiles((prev) =>
          prev.map((f) =>
            f.id === newFile.id
              ? {
                  ...f,
                  status: "completed",
                  progress: 100,
                  downloadUrl: URL.createObjectURL(blob),
                  file: new File([], suggestedName || fileName, {
                    type: mimeType,
                  }),
                }
              : f
          )
        );
      }
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === newFile.id
            ? {
                ...f,
                status: "error",
                error: "Failed to download audio",
              }
            : f
        )
      );
    }
  };

  return (
    <section id="convert" className="py-16 md:py-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Convert Your Files
          </h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Select the type of conversion you need and upload your files
          </p>
        </div>

        <div className="flex flex-wrap justify-center mb-8 gap-2">
          <button
            onClick={() => setActiveTab("audio")}
            className={`flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === "audio"
                ? "bg-primary-500 text-white"
                : "bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-300"
            }`}
          >
            <FileAudio className="h-4 w-4 mr-2" />
            Audio
          </button>
          <button
            onClick={() => setActiveTab("image")}
            className={`flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === "image"
                ? "bg-primary-500 text-white"
                : "bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-300"
            }`}
          >
            <FileImage className="h-4 w-4 mr-2" />
            Image
          </button>
          <button
            onClick={() => setActiveTab("document")}
            className={`flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === "document"
                ? "bg-primary-500 text-white"
                : "bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-300"
            }`}
          >
            <FileText className="h-4 w-4 mr-2" />
            Document
          </button>
          <button
            onClick={() => setActiveTab("video")}
            className={`flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === "video"
                ? "bg-primary-500 text-white"
                : "bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-300"
            }`}
          >
            <FileVideo className="h-4 w-4 mr-2" />
            Video
          </button>
          <button
            onClick={() => setActiveTab("extract")}
            className={`flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === "extract"
                ? "bg-primary-500 text-white"
                : "bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-300"
            }`}
          >
            <YoutubeIcon className="h-4 w-4 mr-2" />
            Extract Audio
          </button>
        </div>

        <div className="bg-white dark:bg-dark-100 rounded-xl shadow-lg p-6 md:p-8 mb-8">
          {activeTab === "extract" ? (
            <ExtractAudioForm onSubmit={handleExtractAudio} />
          ) : (
            <>
              <FileUploadArea
                type={activeTab}
                onFilesAdded={(files) => handleAddFiles(files, activeTab)}
              />

              {files.length > 0 && (
                <ConversionOptions
                  files={files.filter((f) => f.type === activeTab)}
                  onUpdateOptions={updateFileOptions}
                />
              )}
            </>
          )}
        </div>

        {files.length > 0 && (
          <div className="bg-white dark:bg-dark-100 rounded-xl shadow-lg p-6 md:p-8 mb-8">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              File Queue
            </h3>

            <div className="space-y-4">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex flex-col bg-gray-50 dark:bg-gray-700 rounded-lg p-4 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      {file.status === "idle" && (
                        <FileUp className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                      )}
                      {file.status === "processing" && (
                        <Upload className="h-5 w-5 text-indigo-500 animate-pulse" />
                      )}
                      {file.status === "completed" && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                      {file.status === "error" && (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      )}
                      {file.status === "cancelled" && (
                        <XCircle className="h-5 w-5 text-orange-500" />
                      )}

                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-200">
                          {file.file.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {file.type === "extract"
                            ? "Audio Extraction"
                            : file.type}
                          {file.targetFormat &&
                            ` • Convert to ${file.targetFormat}`}
                          {file.targetSize &&
                            ` • Resize to ${file.targetSize}MB`}
                          {file.status === "processing" &&
                            ` • ${file.progress}%`}
                        </p>
                        {file.error && (
                          <p className="text-sm text-red-500">{file.error}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {file.status === "processing" && (
                        <button
                          onClick={() => handleCancelConversion(file.id)}
                          className="flex items-center px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Cancel
                        </button>
                      )}

                      {file.status === "completed" && file.downloadUrl && (
                        <button
                          onClick={() => handleDownload(file)}
                          className="flex items-center px-3 py-1 bg-primary-500 hover:bg-primary-600 text-white rounded-md transition-colors"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </button>
                      )}

                      {file.status !== "processing" && (
                        <button
                          onClick={() => handleRemoveFile(file.id)}
                          className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {(file.status === "processing" ||
                    file.status === "completed") && (
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          file.status === "completed"
                            ? "bg-green-500"
                            : "bg-primary-500 animate-pulse"
                        }`}
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-center">
              <button
                onClick={handleConvert}
                disabled={
                  isProcessing || files.every((f) => f.status !== "idle")
                }
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  isProcessing || files.every((f) => f.status !== "idle")
                    ? "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    : "bg-primary-500 hover:bg-primary-600 text-white"
                }`}
              >
                {isProcessing ? "Converting..." : "Convert Files"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default ConversionTool;
