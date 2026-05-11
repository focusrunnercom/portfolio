
import React from 'react';

const MapPinIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 mr-2 inline-block">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
    </svg>
);

const MailIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 mr-2 inline-block">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
    </svg>
);

export const Footer: React.FC = () => {
    const address = "10555 62nd Dr Suite 2D, Forest Hills, NY, 11375";
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

    return (
        <footer id="contact" className="bg-dark-secondary border-t border-dark-tertiary">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
                    <div>
                        <h3 className="text-xl font-bold text-text-primary">FocusRunner</h3>
                        <p className="mt-2 text-text-secondary">Done-for-You AI Marketing Services.</p>
                    </div>
                    <div>
                        <h4 className="font-semibold text-text-primary">Contact Us</h4>
                        <ul className="mt-2 space-y-2">
                            <li>
                                <a href="mailto:contact@focusrunner.com" className="text-text-secondary hover:text-brand-blue transition-colors">
                                    <MailIcon />
                                    contact@focusrunner.com
                                </a>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold text-text-primary">Our Office</h4>
                        <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="mt-2 text-text-secondary hover:text-brand-blue transition-colors inline-block">
                           <MapPinIcon />
                           {address}
                        </a>
                    </div>
                </div>
                <div className="mt-12 pt-8 border-t border-dark-tertiary text-center text-text-secondary">
                    <p>&copy; {new Date().getFullYear()} FocusRunner. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
};
