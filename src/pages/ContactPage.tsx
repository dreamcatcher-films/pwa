

import React, { useState, useEffect } from 'react';
import ContactForm from '../components/ContactForm.tsx';
import { BuildingOffice2Icon, EnvelopeIcon, PhoneIcon, MapIcon, LoadingSpinner } from '../components/Icons.tsx';

interface ContactDetails {
    contact_email: string;
    contact_phone: string;
    contact_address: string;
    google_maps_api_key: string;
}

const ContactInfoItem: React.FC<{ icon: React.ReactNode, label: string, value: string, href?: string }> = ({ icon, label, value, href }) => (
    <a 
        href={href} 
        target="_blank" 
        rel="noopener noreferrer"
        className={`flex items-start gap-4 p-4 rounded-lg transition-colors ${href ? 'hover:bg-slate-100' : ''}`}
    >
        <div className="flex-shrink-0 text-indigo-600 mt-1">{icon}</div>
        <div>
            <p className="font-semibold text-slate-800">{label}</p>
            <p className="text-slate-600">{value || <span className="italic text-slate-400">Brak danych</span>}</p>
        </div>
    </a>
);

const ContactPage: React.FC = () => {
    const [details, setDetails] = useState<ContactDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchContactDetails = async () => {
            try {
                const response = await fetch('/api/contact-details');
                if (!response.ok) {
                    throw new Error('Nie udało się załadować danych kontaktowych.');
                }
                const data = await response.json();
                setDetails(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchContactDetails();
    }, []);

    const googleMapsLink = details ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.contact_address)}` : '#';
    const googleMapsStaticImage = details ? `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(details.contact_address)}&zoom=14&size=600x400&maptype=roadmap&markers=color:blue%7Clabel:D%7C${encodeURIComponent(details.contact_address)}&key=${details.google_maps_api_key || ''}` : '';

    return (
        <div className="max-w-6xl mx-auto py-8">
            <header className="text-center mb-12">
                <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Skontaktuj się z nami</h1>
                <p className="mt-4 text-xl text-slate-600 max-w-3xl mx-auto">Masz pytania lub pomysł na projekt? Jesteśmy tutaj, aby pomóc. Wypełnij formularz lub skorzystaj z poniższych danych.</p>
            </header>

            <div className="grid lg:grid-cols-5 gap-12">
                <div className="lg:col-span-3">
                    <div className="bg-white rounded-2xl shadow-lg p-8">
                        <ContactForm />
                    </div>
                </div>
                <div className="lg:col-span-2">
                    <div className="space-y-8">
                        <div className="bg-white rounded-2xl shadow-lg p-6">
                            <h3 className="text-xl font-bold text-slate-800 mb-4">Dane kontaktowe</h3>
                            {isLoading ? <LoadingSpinner /> : error ? <p className="text-red-500">{error}</p> : (
                                <div className="space-y-2">
                                   <ContactInfoItem icon={<PhoneIcon className="w-6 h-6"/>} label="Telefon" value={details?.contact_phone} href={`tel:${details?.contact_phone.replace(/\s/g, '')}`} />
                                   <ContactInfoItem icon={<EnvelopeIcon className="w-6 h-6"/>} label="E-mail" value={details?.contact_email} href={`mailto:${details?.contact_email}`} />
                                   <ContactInfoItem icon={<BuildingOffice2Icon className="w-6 h-6"/>} label="Adres" value={details?.contact_address} href={googleMapsLink} />
                                </div>
                            )}
                        </div>

                        <div className="bg-white rounded-2xl shadow-lg p-6">
                             <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <MapIcon className="w-6 h-6 text-indigo-600"/>
                                Znajdź nas na mapie
                            </h3>
                            {isLoading ? <LoadingSpinner /> : error || !details?.google_maps_api_key ? <p className="text-sm text-slate-500">Mapa jest chwilowo niedostępna.</p> : (
                                <a href={googleMapsLink} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden group">
                                    <img 
                                        src={googleMapsStaticImage} 
                                        alt={`Mapa pokazująca lokalizację ${details?.contact_address}`}
                                        className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
                                    />
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContactPage;
