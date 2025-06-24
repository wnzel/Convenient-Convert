import React from 'react';
import { ArrowDown, FileUp } from 'lucide-react';

const Hero: React.FC = () => {
  return (
    <section className="pt-24 pb-12 md:pt-32 md:pb-16">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex items-center justify-center p-2 bg-teal-100 dark:bg-teal-900/30 rounded-full mb-6">
            <FileUp className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-4 md:mb-6 leading-tight">
            Convert Any File <br className="hidden md:block" />
            <span className="text-teal-600 dark:text-teal-400">Quickly & Easily</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-3xl mb-8 md:mb-10">
            Transform audio, images, documents, and videos into various formats. 
            Resize your files to specific size limits with just a few clicks.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-10 md:mb-12">
            <a 
              href="#convert" 
              className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all w-full sm:w-auto text-center"
            >
              Start Converting
            </a>
            <a 
              href="#features" 
              className="px-6 py-3 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 font-medium rounded-lg shadow hover:shadow-md transition-all w-full sm:w-auto text-center"
            >
              Explore Features
            </a>
          </div>
          <div className="flex justify-center w-full max-w-4xl mx-auto">
            <div className="w-full h-[400px] bg-gradient-to-b from-teal-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-xl flex items-center justify-center overflow-hidden">
              <div className="relative w-full h-full flex items-center justify-center">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4/5 h-3/4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl flex flex-col items-center justify-center p-8">
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 w-full h-full flex flex-col items-center justify-center">
                    <FileUp className="h-12 w-12 text-teal-500 dark:text-teal-400 mb-4" />
                    <p className="text-gray-700 dark:text-gray-300 text-lg font-medium mb-2">Drag & Drop your files here</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">or click to browse</p>
                    <button className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-md transition-colors">
                      Upload Files
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-12 flex justify-center">
            <a 
              href="#features"
              className="flex flex-col items-center text-gray-500 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors animate-bounce"
            >
              <span className="mb-2">Scroll to learn more</span>
              <ArrowDown className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;