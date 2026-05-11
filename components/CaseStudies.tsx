import React from 'react';
import type { CaseStudy } from '../types';
import { CASE_STUDIES } from '../constants';

const CaseStudyCard: React.FC<{ study: CaseStudy }> = ({ study }) => (
  <div className="group relative p-8 bg-dark-secondary rounded-2xl border border-dark-tertiary overflow-hidden transition-all duration-300 hover:border-brand-cyan hover:-translate-y-2">
    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-brand-cyan/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
    <div className="relative z-10">
      <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-brand-cyan/20 text-brand-cyan uppercase tracking-wider">
        {study.industry}
      </span>
      <h3 className="mt-4 text-xl font-bold text-text-primary">{study.title}</h3>
      <p className="mt-3 text-text-secondary leading-relaxed">{study.description}</p>
      <div className="mt-6 grid grid-cols-2 gap-4">
        {study.metrics.map((metric, idx) => (
          <div key={idx} className="text-center p-3 bg-dark-tertiary rounded-lg">
            <div className="text-2xl font-extrabold text-brand-blue">{metric.value}</div>
            <div className="text-xs text-text-secondary mt-1">{metric.label}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const CaseStudies: React.FC = () => {
  return (
    <section id="results" className="py-20 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">
            Results That Speak for Themselves
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            Real outcomes from our managed AI marketing services. We don't just build systems — we deliver measurable impact.
          </p>
        </div>
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {CASE_STUDIES.map((study, index) => (
            <CaseStudyCard key={index} study={study} />
          ))}
        </div>
        <div className="mt-12 text-center">
          <p className="text-sm text-text-secondary italic">
            More case studies coming soon. Want to be the next?{' '}
            <a
              data-cal-link="lambo5/focusrunner"
              className="cursor-pointer text-brand-blue hover:underline font-medium"
            >
              Book a call →
            </a>
          </p>
        </div>
      </div>
    </section>
  );
};
