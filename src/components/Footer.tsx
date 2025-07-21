
import React, { useState, useEffect } from 'react';
import { EnvelopeIcon, PhoneIcon, InstagramIcon, YouTubeIcon } from './Icons.tsx';

interface ContactDetails {
    contact_email: string;
    contact_phone: string;
}

const Footer: React.FC = () => {
    const [details, setDetails] = useState<ContactDetails | null>(null);

    useEffect(() => {
        const fetchContactDetails = async () => {
            try {
                const response = await fetch('/api/contact-details');
                if (response.ok) {
                    const data = await response.json();
                    setDetails(data);
                }
            } catch (error) {
                console.error('Failed to fetch contact details for footer:', error);
            }
        };
        fetchContactDetails();
    }, []);

    const currentYear = new Date().getFullYear();

    return (
        <footer className="bg-[#0F3E34] text-slate-300 relative footer-gradient-overlay">
            <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 text-center">
                <img src="/dreamcatcher-icon.png" alt="Dreamcatcher Film Logo" className="h-16 w-16 mx-auto mb-6" />

                {details && (
                    <div className="flex justify-center items-center flex-wrap gap-x-8 gap-y-4 mb-8">
                        <a href={`mailto:${details.contact_email}`} className="flex items-center gap-2 hover:text-white transition-colors">
                            <EnvelopeIcon className="w-5 h-5" />
                            <span>{details.contact_email}</span>
                        </a>
                        <a href={`tel:${details.contact_phone.replace(/\s/g, '')}`} className="flex items-center gap-2 hover:text-white transition-colors">
                            <PhoneIcon className="w-5 h-5" />
                            <span>{details.contact_phone}</span>
                        </a>
                    </div>
                )}
                
                <div className="flex justify-center space-x-6 mb-8">
                    <a href="https://www.instagram.com/dreamcatcher_film_" target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-white transition-colors" aria-label="Instagram">
                        <InstagramIcon className="w-7 h-7" />
                    </a>
                    <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-white transition-colors" aria-label="YouTube">
                       <YouTubeIcon className="w-7 h-7" />
                    </a>
                </div>
                
                <p className="text-sm text-slate-400">
                    &copy; {currentYear} Dreamcatcher Film. Wszelkie prawa zastrzeżone.
                </p>
            </div>
        </footer>
    );
};

export default Footer;
