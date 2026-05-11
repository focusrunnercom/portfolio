import React from 'react';

export const Hero: React.FC = () => {
  return (
    <section className="relative overflow-hidden bg-dark-secondary py-20 sm:py-32 lg:py-40">
       <div
        className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] lg:w-[800px] lg:h-[800px] rounded-full bg-gradient-to-tr from-brand-blue/30 via-brand-cyan/20 to-transparent blur-3xl opacity-50"
        aria-hidden="true"
      />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 animate-fade-in-up">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-gray-400">
            Done-for-You AI Marketing
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto">
            We build, deploy, and manage AI-powered marketing systems so you don't have to. Voice agents that handle calls, automated email campaigns that convert, and workflows that run your pipeline — all managed for you. You get the results, we handle the rest.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <a
              data-cal-link="lambo5/focusrunner"
              className="cursor-pointer px-8 py-4 bg-brand-blue text-white text-lg font-semibold rounded-lg shadow-lg hover:bg-opacity-90 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-opacity-75 transition-all duration-300"
            >
              Get a Free Consultation
            </a>
            <a
              href="#services"
              className="text-lg font-semibold leading-6 text-text-primary hover:text-brand-blue transition-colors"
            >
              See what we do <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};