
import React from 'react';
import type { Service } from '../types';
import { SERVICES } from '../constants';

const ServiceCard: React.FC<{ service: Service }> = ({ service }) => {
  return (
    <div className="group relative p-8 bg-dark-secondary rounded-2xl border border-dark-tertiary overflow-hidden transition-all duration-300 hover:border-brand-blue hover:-translate-y-2">
       <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-brand-blue/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
       <div className="relative z-10">
        <div className="inline-block p-4 bg-dark-tertiary rounded-xl text-brand-blue">
            {service.icon}
        </div>
        <h3 className="mt-6 text-2xl font-bold text-text-primary">{service.title}</h3>
        <p className="mt-4 text-text-secondary">{service.description}</p>
       </div>
    </div>
  );
};

export const Services: React.FC = () => {
  return (
    <section id="services" className="py-20 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">AI Marketing Services, Fully Managed</h2>
          <p className="mt-4 text-lg text-text-secondary">
            We don't sell software — we deliver outcomes. Each service is built, deployed, and run by our team so you get results without lifting a finger.
          </p>
        </div>
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {SERVICES.map((service, index) => (
            <ServiceCard key={index} service={service} />
          ))}
        </div>
      </div>
    </section>
  );
};
