import React from 'react';
import { FileUp } from 'lucide-react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-900 dark:bg-dark-50 text-gray-300 py-8">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center space-x-2 mb-4">
            <FileUp className="h-6 w-6 text-primary-400" />
            <span className="text-xl font-bold text-white">ConvenientConvert</span>
          </div>
          <p className="text-gray-400 text-center">
            The all-in-one file conversion solution for all your media needs.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mx-auto">
          <div>
            <h3 className="text-white font-semibold mb-4 text-center md:text-left">Features</h3>
            <ul className="space-y-2 text-center md:text-left">
              <li>
                <a href="#" className="text-gray-400 hover:text-primary-400 transition-colors">
                  Audio Conversion
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-400 hover:text-primary-400 transition-colors">
                  Image Conversion
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-400 hover:text-primary-400 transition-colors">
                  Document Conversion
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-400 hover:text-primary-400 transition-colors">
                  Video Conversion
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-400 hover:text-primary-400 transition-colors">
                  Audio Extraction
                </a>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-white font-semibold mb-4 text-center md:text-left">Legal</h3>
            <ul className="space-y-2 text-center md:text-left">
              <li>
                <Link to="/privacy" className="text-gray-400 hover:text-primary-400 transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-gray-400 hover:text-primary-400 transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-dark-300 mt-8 pt-8 text-center">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} ConvenientConvert. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;