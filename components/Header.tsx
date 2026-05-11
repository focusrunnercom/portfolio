import React, { useState } from 'react';

const Logo: React.FC = () => (
  <a href="#" className="text-2xl font-bold tracking-tighter text-text-primary">
    FocusRunner
  </a>
);

const NavLinks: React.FC<{ className?: string }> = ({ className }) => (
  <nav className={`flex items-center gap-6 ${className}`}>
    <a href="#services" className="text-text-secondary hover:text-text-primary transition-colors duration-300">Services</a>
    <a href="#results" className="text-text-secondary hover:text-text-primary transition-colors duration-300">Results</a>
    <a href="#about" className="text-text-secondary hover:text-text-primary transition-colors duration-300">Why Us</a>
    <a href="#contact" className="text-text-secondary hover:text-text-primary transition-colors duration-300">Contact</a>
  </nav>
);

const CtaButton: React.FC = () => (
  <a
    data-cal-link="lambo5/focusrunner"
    className="cursor-pointer px-5 py-2.5 bg-brand-blue text-white font-semibold rounded-lg shadow-md hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-opacity-75 transition-all duration-300"
  >
    Get Started
  </a>
);

const HamburgerIcon: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-dark-tertiary focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-blue md:hidden">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12"></line>
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <line x1="3" y1="18" x2="21" y2="18"></line>
    </svg>
  </button>
);

export const Header: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-dark-primary/80 backdrop-blur-lg border-b border-dark-tertiary">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Logo />
          <div className="hidden md:flex items-center gap-8">
            <NavLinks />
            <CtaButton />
          </div>
          <HamburgerIcon onClick={() => setMobileMenuOpen(!mobileMenuOpen)} />
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="md:hidden px-4 pt-2 pb-4 space-y-4 border-t border-dark-tertiary">
            <NavLinks className="flex-col !items-start !gap-4" />
            <CtaButton />
        </div>
      )}
    </header>
  );
};