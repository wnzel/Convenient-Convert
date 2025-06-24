import React, { useState, useEffect } from "react";
import { Menu, X, MoonStar, Sun, FileUp } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { Link } from "react-router-dom";

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-white dark:bg-dark border-b border-gray-200 dark:border-dark-200 py-2"
          : "bg-transparent py-4"
      }`}
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <FileUp className="h-6 w-6 text-primary-400" />
            <span className="text-xl font-bold text-gray-900 dark:text-white">
              Convenient Convert
            </span>
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            <a
              href="#features"
              className="text-gray-700 dark:text-gray-300 hover:text-primary-400 dark:hover:text-primary-400 transition-colors"
            >
              Features
            </a>
            <a
              href="#convert"
              className="text-gray-700 dark:text-gray-300 hover:text-primary-400 dark:hover:text-primary-400 transition-colors"
            >
              Convert
            </a>
            <a
              href="#faq"
              className="text-gray-700 dark:text-gray-300 hover:text-primary-400 dark:hover:text-primary-400 transition-colors"
            >
              FAQ
            </a>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-dark-200 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5 text-primary-400" />
              ) : (
                <MoonStar className="h-5 w-5 text-primary-400" />
              )}
            </button>
          </div>

          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-200 transition-colors"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden mt-4 py-4 bg-white dark:bg-dark-100 rounded-lg shadow-lg animate-fadeIn border border-gray-200 dark:border-dark-200">
            <div className="flex flex-col space-y-4 px-4">
              <a
                href="#features"
                className="text-gray-700 dark:text-gray-300 hover:text-primary-400 dark:hover:text-primary-400 transition-colors py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Features
              </a>
              <a
                href="#convert"
                className="text-gray-700 dark:text-gray-300 hover:text-primary-400 dark:hover:text-primary-400 transition-colors py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Convert
              </a>
              <a
                href="#faq"
                className="text-gray-700 dark:text-gray-300 hover:text-primary-400 dark:hover:text-primary-400 transition-colors py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                FAQ
              </a>
              <button
                onClick={toggleTheme}
                className="flex items-center space-x-2 text-gray-700 dark:text-gray-300 py-2"
              >
                <span>Toggle Theme</span>
                {theme === "dark" ? (
                  <Sun className="h-5 w-5 text-primary-400" />
                ) : (
                  <MoonStar className="h-5 w-5 text-primary-400" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
