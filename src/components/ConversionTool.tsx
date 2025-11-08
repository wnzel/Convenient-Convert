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
  const conversionTimers = useRef<{
    [key: string]: ReturnType<typeof setInterval>;
  }>({});

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
    if (fileItem.type === "extract") {
      // Use the provided title-based filename directly for extracted audio
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
    title?: string,
    sourceExt?: string
  ) => {
    const safeTitle = title
      ? title
          .replace(/[\\/:*?"<>|]/g, "-")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80)
      : `extracted-audio-${Date.now()}`;
    const fileName = `${safeTitle}.${format}`;
    const mimeByExt: Record<string, string> = {
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      wav: "audio/wav",
      flac: "audio/flac",
      ogg: "audio/ogg",
      webm: "audio/webm",
      aac: "audio/aac",
      opus: "audio/ogg", // common container reported for opus
    };
    const mime = mimeByExt[format.toLowerCase()] || "audio/mpeg";

    const newFile: FileItem = {
      id: `extract-${Date.now()}`,
      file: new File([], fileName, { type: mime }),
      status: "processing",
      type: "extract",
      targetFormat: format,
      progress: 0,
    };

    setFiles((prev) => [...prev, newFile]);

    try {
      let response: Response;
      if (format.toLowerCase() === "mp3" && sourceExt && sourceExt !== "mp3") {
        const transcodeUrl = `/api/transcode?url=${encodeURIComponent(
          audioUrl
        )}&format=mp3&filename=${encodeURIComponent(fileName)}`;
        response = await fetch(transcodeUrl);
      } else {
        // Route through server download proxy to bypass CORS and set filename
        const proxyUrl = `/api/download?url=${encodeURIComponent(
          audioUrl
        )}&filename=${encodeURIComponent(fileName)}`;
        response = await fetch(proxyUrl);
      }
      if (!response.ok) throw new Error("Failed to download audio");

      const blob = await response.blob();

      setFiles((prev) =>
        prev.map((f) =>
          f.id === newFile.id
            ? {
                ...f,
                status: "completed",
                progress: 100,
                downloadUrl: URL.createObjectURL(blob),
              }
            : f
        )
      );
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
                            ` • ${file.targetFormat.toUpperCase()}`}
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
