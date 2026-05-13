import React from 'react';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Services } from './components/Services';
import { CaseStudies } from './components/CaseStudies';
import { CtaSection } from './components/CtaSection';
import { Footer } from './components/Footer';
import ChatBot from './components/ChatBot';

const App: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col font-sans">
      <Header />
      <main className="flex-grow">
        <Hero />
        <Services />
        <CaseStudies />
        <CtaSection />
      </main>
      <Footer />
      <ChatBot />
    </div>
  );
};

export default App;
