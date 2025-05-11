import React from 'react';
import { FileAudio, FileImage, FileText, FileVideo, Clock, FileCheck, Lock, Zap, Youtube } from 'lucide-react';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description }) => {
  return (
    <div className="bg-gray-50 dark:bg-dark-100 rounded-xl shadow-md hover:shadow-lg transition-shadow p-6 flex flex-col items-center sm:items-start text-center sm:text-left border border-gray-200 dark:border-dark-200 hover:border-primary-500/50">
      <div className="mb-4 p-3 bg-primary-500/10 rounded-full">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
      <p className="text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  );
};

const Features: React.FC = () => {
  const features = [
    {
      icon: <FileAudio className="h-6 w-6 text-primary-400" />,
      title: "Audio Conversion",
      description: "Convert between MP3, WAV, FLAC, AAC, and more audio formats with high-quality output."
    },
    {
      icon: <FileImage className="h-6 w-6 text-primary-400" />,
      title: "Image Conversion",
      description: "Transform images between JPG, PNG, WEBP, SVG formats while preserving quality."
    },
    {
      icon: <FileText className="h-6 w-6 text-primary-400" />,
      title: "Document Conversion",
      description: "Convert docs between PDF, DOCX, TXT, and more with formatting preserved."
    },
    {
      icon: <FileVideo className="h-6 w-6 text-primary-400" />,
      title: "Video Conversion",
      description: "Convert videos to MP4, AVI, MOV, and other formats with customizable settings."
    },
    {
      icon: <Zap className="h-6 w-6 text-primary-400" />,
      title: "Resize Files",
      description: "Quickly resize files to meet specific size requirements (8MB, 10MB, 25MB, etc.)."
    },
    {
      icon: <Youtube className="h-6 w-6 text-primary-400" />,
      title: "Audio Extraction",
      description: "Extract audio from YouTube and TikTok videos in your preferred format."
    },
    {
      icon: <Clock className="h-6 w-6 text-primary-400" />,
      title: "Fast Processing",
      description: "Lightning-fast conversion with our optimized algorithms and servers."
    },
    {
      icon: <Lock className="h-6 w-6 text-primary-400" />,
      title: "Privacy First",
      description: "Your files are automatically deleted after conversion for maximum privacy."
    }
  ];

  return (
    <section id="features" className="py-16 md:py-24 bg-gray-50 dark:bg-dark">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Powerful Conversion Features
          </h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-lg">
            Our platform offers a comprehensive set of tools to handle all your file conversion needs
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {features.map((feature, index) => (
            <FeatureCard 
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;