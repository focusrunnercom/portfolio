import React from 'react';

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-brand-blue">
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
);

const Feature: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <li className="flex items-start">
        <div className="flex-shrink-0">
            <CheckIcon />
        </div>
        <p className="ml-3 text-text-secondary">{children}</p>
    </li>
);

export const CtaSection: React.FC = () => {
    return (
        <section id="about" className="bg-dark-secondary py-20 sm:py-32">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <div>
                        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">
                            AI Agency That Does the Work, Not Just the Strategy
                        </h2>
                        <p className="mt-4 text-lg text-text-secondary">
                            At FocusRunner, we integrate deeply with your business to build AI systems that don't just perform tasks—they achieve goals. We're your dedicated partner in navigating the future of marketing.
                        </p>
                        <ul className="mt-8 space-y-4">
                            <Feature>
                                <strong>Tailored Solutions:</strong> No one-size-fits-all. We build custom AI workflows for your unique challenges.
                            </Feature>
                            <Feature>
                                <strong>Data-Driven Results:</strong> Every action is tracked, analyzed, and optimized for maximum ROI.
                            </Feature>
                            <Feature>
                                <strong>Seamless Integration:</strong> Our solutions work with the tools you already use, enhancing your existing stack.
                            </Feature>
                        </ul>
                    </div>
                    <div className="bg-dark-tertiary p-8 rounded-2xl text-center">
                        <h3 className="text-2xl font-bold text-text-primary">Ready to Transform Your Business?</h3>
                        <p className="mt-4 text-text-secondary">
                            Let's discuss how AI can unlock your company's full potential. Schedule a complimentary strategy session with our experts today.
                        </p>
                        <a
                            data-cal-link="lambo5/focusrunner"
                            className="cursor-pointer mt-8 inline-block px-12 py-4 bg-brand-blue text-white text-lg font-semibold rounded-lg shadow-lg hover:bg-opacity-90 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-opacity-75 transition-all duration-300"
                        >
                            Book Your Free Call
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
};