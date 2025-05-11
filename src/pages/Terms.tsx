import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Terms: React.FC = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="container mx-auto px-4 py-12">
        <Link 
          to="/" 
          className="inline-flex items-center text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 mb-8"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Link>

        <div className="max-w-3xl mx-auto prose dark:prose-invert">
          <h1>Terms of Service</h1>
          <p className="text-gray-600 dark:text-gray-400">Effective Date: March 15, 2024</p>

          <p>
            Welcome to ConvenientConvert.com. By using our service, you agree to the following terms:
          </p>

          <h2>1. Use at Your Own Risk</h2>
          <p>
            Our file conversion tools are provided "as is" without warranty. We are not liable for any
            data loss, corruption, or damages resulting from using our site.
          </p>

          <h2>2. Acceptable Use</h2>
          <p>You agree not to use our platform for:</p>
          <ul>
            <li>Uploading illegal or copyrighted content without permission</li>
            <li>Attempting to reverse-engineer or overload our systems</li>
            <li>Using automation/bots to abuse our service</li>
          </ul>
          <p>
            We reserve the right to block or remove content and restrict access to users who violate these terms.
          </p>

          <h2>3. Content Ownership</h2>
          <p>
            You retain ownership of your uploaded files. We claim no rights to your content and only use it
            temporarily to perform the requested conversion.
          </p>
          <p>
            You are solely responsible for ensuring you have the right to use any content you upload.
          </p>

          <h2>4. YouTube and Third-Party Content</h2>
          <p>
            Our tools that interact with YouTube, TikTok, or other platforms are meant only for personal,
            fair use. You agree not to use these tools to violate third-party terms of service or copyright laws.
          </p>
          <p>
            We may disable or restrict these tools at any time to comply with legal obligations.
          </p>

          <h2>5. Service Availability</h2>
          <p>
            We do our best to keep the site online, but we don't guarantee uptime. Maintenance or errors
            may occasionally cause downtime.
          </p>

          <h2>6. Changes</h2>
          <p>
            We may update these terms at any time. Continued use of the site means you accept the new terms.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Terms;