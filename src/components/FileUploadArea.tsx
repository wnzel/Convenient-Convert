import React, { useState, useRef } from 'react';
import { FileUp } from 'lucide-react';
import type { ConversionType } from './ConversionTool';

interface FileUploadAreaProps {
  type: ConversionType;
  onFilesAdded: (files: FileList | null) => void;
}

const FileUploadArea: React.FC<FileUploadAreaProps> = ({ type, onFilesAdded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Get allowed extensions based on type
  const getAllowedExtensions = () => {
    switch (type) {
      case 'audio':
        return '.mp3, .wav, .ogg, .flac, .aac, .m4a';
      case 'image':
        return '.jpg, .jpeg, .png, .gif, .webp, .svg, .bmp';
      case 'document':
        return '.pdf, .doc, .docx, .txt, .rtf, .odt, .ppt, .pptx, .xls, .xlsx';
      case 'video':
        return '.mp4, .mov, .avi, .mkv, .webm, .flv, .wmv';
      default:
        return '*';
    }
  };
  
  // Get file type label
  const getTypeLabel = () => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };
  
  // Handle drag events
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesAdded(e.dataTransfer.files);
    }
  };
  
  // Handle click on the upload area
  const handleClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle file selection from file input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilesAdded(e.target.files);
    // Reset the input value to allow uploading the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer ${
        isDragging 
          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' 
          : 'border-gray-300 dark:border-gray-600 hover:border-teal-400 dark:hover:border-teal-500'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept={getAllowedExtensions()}
        multiple
      />
      <div className="flex flex-col items-center justify-center text-center">
        <FileUp className={`h-12 w-12 mb-4 ${
          isDragging ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500'
        }`} />
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
          {isDragging ? `Drop your ${getTypeLabel()} Files Here` : `Upload ${getTypeLabel()} Files`}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Drag and drop your files here or click to browse
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Accepted formats: {getAllowedExtensions().replace(/\./g, '')}
        </p>
      </div>
    </div>
  );
};

export default FileUploadArea;