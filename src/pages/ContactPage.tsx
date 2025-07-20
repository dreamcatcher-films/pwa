
import React from 'react';
import ContactForm from '../components/ContactForm.tsx';
import { BuildingOffice2Icon, EnvelopeIcon, PhoneIcon, MapIcon } from '../components/Icons.tsx';

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
            <p className="text-slate-600">{value}</p>
        </div>
    </a>
);

const ContactPage: React.FC = () => {
    // Placeholder data - replace with your actual information
    const contactEmail = "info@dreamcatcherfilm.co.uk";
    const contactPhone = "+48 123 456 789";
    const contactAddress = "ul. Filmowa 123, 00-001 Warszawa, Polska";
    const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contactAddress)}`;
    const googleMapsStaticImage = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(contactAddress)}&zoom=14&size=600x400&maptype=roadmap&markers=color:blue%7Clabel:D%7C${encodeURIComponent(contactAddress)}&key=${process.env.GOOGLE_MAPS_API_KEY || ''}`;


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
                            <div className="space-y-2">
                               <ContactInfoItem icon={<PhoneIcon className="w-6 h-6"/>} label="Telefon" value={contactPhone} href={`tel:${contactPhone.replace(/\s/g, '')}`} />
                               <ContactInfoItem icon={<EnvelopeIcon className="w-6 h-6"/>} label="E-mail" value={contactEmail} href={`mailto:${contactEmail}`} />
                               <ContactInfoItem icon={<BuildingOffice2Icon className="w-6 h-6"/>} label="Adres" value={contactAddress} href={googleMapsLink} />
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl shadow-lg p-6">
                             <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <MapIcon className="w-6 h-6 text-indigo-600"/>
                                Znajdź nas na mapie
                            </h3>
                            <a href={googleMapsLink} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden group">
                                <img 
                                    src={googleMapsStaticImage} 
                                    alt={`Mapa pokazująca lokalizację ${contactAddress}`}
                                    className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContactPage;
