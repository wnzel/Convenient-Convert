import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FaqItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

const FaqItem: React.FC<FaqItemProps> = ({ question, answer, isOpen, onToggle }) => {
  return (
    <div className="border-b border-gray-200 dark:border-dark-200 last:border-0">
      <button
        className="flex justify-between items-center w-full py-4 text-left focus:outline-none"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">{question}</h3>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-primary-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-primary-400" />
        )}
      </button>
      <div 
        className={`overflow-hidden transition-all duration-300 ${
          isOpen ? 'max-h-96 opacity-100 pb-4' : 'max-h-0 opacity-0'
        }`}
      >
        <p className="text-gray-600 dark:text-gray-400">{answer}</p>
      </div>
    </div>
  );
};

const Faq: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  
  const faqItems = [
    {
      question: "What file types can I convert?",
      answer: "ConvenientConvert supports a wide range of file formats. For audio: MP3, WAV, FLAC, AAC, M4A, and OGG. For images: JPG, PNG, GIF, WEBP, SVG, and BMP. For documents: PDF, DOCX, TXT, RTF, and more. For videos: MP4, MOV, AVI, WEBM, and MKV."
    },
    {
      question: "How does file size limitation work?",
      answer: "Our file size limitation tool allows you to specify a maximum file size limit (such as 8MB, 10MB, or 25MB), and our system will automatically optimize the file to meet that requirement while maintaining the best possible quality."
    },
    {
      question: "Is there a limit to how many files I can convert?",
      answer: "No! Our service is completely free with no limits on the number of conversions."
    },
    {
      question: "How long are my files stored?",
      answer: "Your privacy is important to us. All uploaded files and converted results are automatically deleted after processing or after a short time (typically within 1 hour). We do not permanently store user files."
    },
    {
      question: "Can I extract audio from any YouTube or TikTok video?",
      answer: "Yes, you can extract audio from most YouTube and TikTok videos. Simply paste the video URL and select your preferred audio format. Please note this feature should only be used for videos where you have permission or that are in the public domain."
    },
    {
      question: "Is my data secure during the conversion process?",
      answer: "Absolutely. We use secure HTTPS connections to transfer your files, and all processing happens on isolated servers. We never access your file contents for any purpose other than performing the requested conversion."
    },
    {
      question: "What is the maximum file size I can upload?",
      answer: "You can upload files up to 2GB in size for conversion."
    }
  ];
  
  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };
  
  return (
    <section id="faq" className="py-16 md:py-24 bg-gray-100 dark:bg-dark">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Got questions about our conversion tool? Find answers to common queries below.
          </p>
        </div>
        
        <div className="max-w-3xl mx-auto bg-white dark:bg-dark-100 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-dark-200">
          <div className="p-6 md:p-8">
            {faqItems.map((item, index) => (
              <FaqItem 
                key={index}
                question={item.question}
                answer={item.answer}
                isOpen={openIndex === index}
                onToggle={() => handleToggle(index)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Faq;