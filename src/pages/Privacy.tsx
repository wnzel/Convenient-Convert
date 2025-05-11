import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Privacy: React.FC = () => {
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
          <h1>Privacy Policy</h1>
          <p className="text-gray-600 dark:text-gray-400">Effective Date: March 15, 2024</p>

          <p>
            At ConvenientConvert.com, we value your privacy. This Privacy Policy explains what information we collect,
            how we use it, and how we protect it.
          </p>

          <h2>1. Information We Collect</h2>
          <p>We collect minimal data necessary to operate the site:</p>
          <ul>
            <li>Uploaded files for conversion (temporarily stored during processing)</li>
            <li>IP address (used for analytics and security)</li>
            <li>Browser/device info (standard web server logs)</li>
          </ul>
          <p>We do not require or collect names, emails, or personal accounts.</p>

          <h2>2. Use of Information</h2>
          <p>We use the data:</p>
          <ul>
            <li>To convert your files and deliver the output</li>
            <li>To improve our platform's performance and security</li>
            <li>For basic analytics (e.g., which formats are most used)</li>
          </ul>
          <p>
            Files are automatically deleted after processing or after a short time (typically within 1 hour).
            We do not permanently store user files.
          </p>

          <h2>3. Third-Party Services</h2>
          <p>We may use third-party services like:</p>
          <ul>
            <li>Hosting providers (e.g., Vercel, Railway)</li>
            <li>Logging/monitoring tools</li>
            <li>Analytics tools (e.g., Plausible, Google Analytics if used)</li>
          </ul>
          <p>These services may collect anonymized traffic data.</p>

          <h2>4. Cookies</h2>
          <p>
            We may use cookies for session control or basic analytics. No tracking cookies are used for advertising.
          </p>

          <h2>5. Your Rights</h2>
          <p>If you're located in the EU, UK, or California, you have rights to:</p>
          <ul>
            <li>Request deletion of your data</li>
            <li>Understand what data we have about you</li>
          </ul>
          <p>Contact us at support@convenientconvert.com to make a request.</p>

          <h2>6. Contact</h2>
          <p>
            If you have any questions, contact us at:<br />
            📧 support@convenientconvert.com
          </p>
        </div>
      </div>
    </div>
  );
};

export default Privacy;