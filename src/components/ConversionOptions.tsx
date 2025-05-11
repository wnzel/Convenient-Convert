import React from 'react';
import { Settings } from 'lucide-react';
import type { FileItem } from './ConversionTool';

interface ConversionOptionsProps {
  files: FileItem[];
  onUpdateOptions: (id: string, options: { targetFormat?: string; targetSize?: number }) => void;
}

const ConversionOptions: React.FC<ConversionOptionsProps> = ({ files, onUpdateOptions }) => {
  // Define target formats based on file type
  const getTargetFormats = (type: string) => {
    switch (type) {
      case 'audio':
        return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
      case 'image':
        return ['jpg', 'png', 'webp', 'gif', 'svg', 'bmp'];
      case 'document':
        return ['pdf', 'docx', 'txt', 'rtf', 'odt', 'html'];
      case 'video':
        return [
          ['mp4', 'mov', 'avi', 'webm', 'mkv', 'gif'],
          ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
        ];
      default:
        return [];
    }
  };
  
  // Predefined size limits
  const sizeLimits = [8, 10, 25, 50, 100];
  
  // Skip if no files to display
  if (files.length === 0) return null;
  
  return (
    <div className="mt-8">
      <div className="flex items-center mb-4">
        <Settings className="h-5 w-5 text-primary-400 mr-2" />
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Conversion Options</h3>
      </div>
      
      <div className="space-y-6">
        {files.map(file => (
          <div key={file.id} className="bg-gray-50 dark:bg-dark-200 rounded-lg p-4 border border-gray-200 dark:border-dark-300">
            <p className="font-medium text-gray-800 dark:text-gray-200 mb-3">
              {file.file.name}
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Target format selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Convert to:
                </label>
                <select
                  value={file.targetFormat || ''}
                  onChange={(e) => onUpdateOptions(file.id, { targetFormat: e.target.value })}
                  className="w-full rounded-md bg-white dark:bg-dark-100 border border-gray-300 dark:border-dark-300 text-gray-700 dark:text-gray-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Select format</option>
                  {file.type === 'video' ? (
                    <>
                      <optgroup label="Video Formats">
                        {getTargetFormats('video')[0].map(format => (
                          <option key={format} value={format}>
                            {format.toUpperCase()}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Audio Formats">
                        {getTargetFormats('video')[1].map(format => (
                          <option key={`audio-${format}`} value={`audio-${format}`}>
                          {format.toUpperCase()}
                          </option>
                        ))}
                      </optgroup>
                    </>
                  ) : (
                    getTargetFormats(file.type).map(format => (
                      <option key={format} value={format}>
                        {format.toUpperCase()}
                      </option>
                    ))
                  )}
                </select>
              </div>
              
              {/* Size limit selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Size limit (optional):
                </label>
                <select
                  value={file.targetSize || ''}
                  onChange={(e) => onUpdateOptions(file.id, { targetSize: Number(e.target.value) || undefined })}
                  className="w-full rounded-md bg-white dark:bg-dark-100 border border-gray-300 dark:border-dark-300 text-gray-700 dark:text-gray-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">No size limit</option>
                  {sizeLimits.map(size => (
                    <option key={size} value={size}>
                      {size} MB
                    </option>
                  ))}
                  <option value="custom">Custom Size</option>
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConversionOptions;