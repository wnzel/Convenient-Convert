import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import ConversionTool from './components/ConversionTool';
import Features from './components/Features';
import Faq from './components/Faq';
import Footer from './components/Footer';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <div className="min-h-screen bg-white dark:bg-dark text-gray-900 dark:text-white transition-colors">
          <Navbar />
          <Routes>
            <Route path="/" element={
              <main>
                <ConversionTool />
                <Features />
                <Faq />
              </main>
            } />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
          </Routes>
          <Footer />
        </div>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;