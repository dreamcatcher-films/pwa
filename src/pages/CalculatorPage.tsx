import React, { useState, useEffect, FC, ReactNode } from 'react';
import { CheckCircleIcon, PlusCircleIcon, MinusCircleIcon, LoadingSpinner, XMarkIcon, ArrowLeftIcon } from '../components/Icons.tsx';
import BookingForm from '../components/BookingForm.tsx';
import { formatCurrency } from '../utils.ts';

// --- DATA STRUCTURE ---
interface ListItem {
    id: string;
    name: string;
    price?: number;
    locked?: boolean;
}

interface Package {
    id: string;
    name: string;
    price: number;
    description: string;
    included: ListItem[];
}

const PACKAGES: Package[] = [
    {
        id: 'gold',
        name: 'Pakiet Złoty',
        price: 5200,
        description: 'Najbardziej kompletny pakiet, aby stworzyć niezapomnianą pamiątkę.',
        included: [
            { id: 'film', name: 'Film kinowy', locked: true },
            { id: 'photos', name: 'Reportaż zdjęciowy (cały dzień)', locked: true },
            { id: 'pre_wedding', name: 'Sesja narzeczeńska', locked: false, price: 600 },
            { id: 'drone', name: 'Ujęcia z drona', locked: false, price: 400 },
            { id: 'social', name: 'Teledysk dla social media', locked: false, price: 350 },
        ]
    },
    {
        id: 'silver',
        name: 'Pakiet Srebrny',
        price: 4500,
        description: 'Najpopularniejszy wybór zapewniający kompleksową relację.',
        included: [
            { id: 'film', name: 'Film kinowy', locked: true },
            { id: 'photos', name: 'Reportaż zdjęciowy (cały dzień)', locked: true },
            { id: 'drone', name: 'Ujęcia z drona', locked: false, price: 400 },
        ]
    },
    {
        id: 'bronze',
        name: 'Pakiet Brązowy',
        price: 3200,
        description: 'Piękny film kinowy, który uchwyci magię Waszego dnia.',
        included: [
            { id: 'film', name: 'Film kinowy', locked: true },
        ]
    },
];

const ALL_ADDONS: ListItem[] = [
    { id: 'pre_wedding', name: 'Sesja narzeczeńska', price: 600 },
    { id: 'drone', name: 'Ujęcia z drona', price: 400 },
    { id: 'social', name: 'Teledysk dla social media', price: 350 },
    { id: 'guest_interviews', name: 'Wywiady z gośćmi', price: 300 },
    { id: 'smoke_candles', name: 'Świece dymne', price: 150 },
];

// --- UI COMPONENTS ---
interface PackageCardProps {
    packageInfo: Package;
    onSelect: (packageId: string) => void;
}

const PackageCard: FC<PackageCardProps> = ({ packageInfo, onSelect }) => (
    <div
        onClick={() => onSelect(packageInfo.id)}
        className="cursor-pointer border-2 p-6 rounded-2xl transition-all duration-300 bg-white hover:border-indigo-400 hover:shadow-xl transform hover:-translate-y-1"
    >
        <h3 className="text-xl font-bold text-slate-800">{packageInfo.name}</h3>
        <p className="text-sm text-slate-500 mt-2 min-h-[40px]">{packageInfo.description}</p>
        <p className="text-2xl font-bold text-slate-900 mt-4">{formatCurrency(packageInfo.price)}</p>
        <ul className="mt-4 space-y-2 text-sm">
            {packageInfo.included.slice(0, 3).map(item => (
                <li key={item.id} className="flex items-center text-slate-600">
                    <CheckCircleIcon className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" />
                    <span>{item.name}</span>
                </li>
            ))}
        </ul>
    </div>
);

interface CustomizationListItemProps {
    item: ListItem;
    isSelected: boolean;
    onToggle: (itemId: string) => void;
}
const CustomizationListItem: FC<CustomizationListItemProps> = ({ item, isSelected, onToggle }) => (
     <div className={`flex items-center justify-between p-4 border rounded-lg transition-all duration-200 ${isSelected ? 'bg-indigo-50 border-indigo-300' : 'bg-white'}`}>
        <div className="flex items-center">
            {item.locked ? (
                <CheckCircleIcon className="w-6 h-6 text-green-500 mr-3" />
            ) : (
                 <button onClick={() => onToggle(item.id)} className="mr-3 focus:outline-none" aria-label={isSelected ? `Usuń ${item.name}` : `Dodaj ${item.name}`}>
                    {isSelected ? <MinusCircleIcon className="w-6 h-6 text-red-500 hover:text-red-700" /> : <PlusCircleIcon className="w-6 h-6 text-green-500 hover:text-green-700" />}
                </button>
            )}
            <div>
                 <span className="font-medium text-slate-800">{item.name}</span>
                 {item.locked && <span className="text-xs font-semibold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full ml-2">W pakiecie</span>}
            </div>
        </div>
        <div className="text-right">
            {item.price !== undefined && !item.locked && (
                <span className="font-semibold text-slate-800">{formatCurrency(item.price)}</span>
            )}
        </div>
    </div>
);

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
}
const Modal: FC<ModalProps> = ({ isOpen, onClose, children }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" aria-modal="true" role="dialog">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full relative transform transition-all duration-300 scale-95 animate-modal-in">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors" aria-label="Zamknij okno">
                    <XMarkIcon className="w-6 h-6" />
                </button>
                {children}
            </div>
        </div>
    );
};

interface BookingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onKeyValidated: (accessKey: string) => void;
}
const BookingModal: FC<BookingModalProps> = ({ isOpen, onClose, onKeyValidated }) => {
    const [accessKey, setAccessKey] = useState('');
    const [error, setError] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

    const handleConfirm = async () => {
        setError('');
        setStatus('loading');
        const apiUrl = import.meta.env.VITE_API_URL;

        if (!apiUrl) {
            setError("Błąd konfiguracji: Brak adresu URL API.");
            setStatus('error');
            return;
        }

        try {
            const response = await fetch(`${apiUrl}/api/validate-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: accessKey }),
            });

            if (!response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.indexOf('application/json') !== -1) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Nieprawidłowy klucz dostępu.');
                } else {
                    throw new Error(`Błąd serwera (${response.status}). Sprawdź adres API i konfigurację CORS.`);
                }
            }
            setStatus('success');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            setStatus('error');
        }
    };
    
    useEffect(() => {
        if (status === 'success') {
            const timer = setTimeout(() => {
                onKeyValidated(accessKey);
                handleClose();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [status, onKeyValidated, accessKey]);


    const handleClose = () => {
        setAccessKey('');
        setError('');
        setStatus('idle');
        onClose();
    }

    const renderContent = () => {
        if (status === 'success') {
            return (
                <div className="text-center">
                    <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-slate-900">Klucz poprawny!</h2>
                    <p className="text-slate-600 mt-2">Przekierowywanie do formularza...</p>
                </div>
            );
        }

        return (
            <>
                <h2 className="text-2xl font-bold text-slate-900 text-center">Potwierdzenie Rezerwacji</h2>
                <p className="text-slate-600 text-center mt-2">Aby kontynuować, wprowadź swój klucz dostępu.</p>
                <div className="mt-6">
                    <label htmlFor="accessKey" className="block text-sm font-medium text-slate-700">Klucz dostępu</label>
                    <input
                        type="text"
                        id="accessKey"
                        value={accessKey}
                        onChange={(e) => setAccessKey(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400
                            focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        placeholder="np. 1234"
                        disabled={status === 'loading'}
                    />
                     {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                </div>
                <div className="mt-8">
                    <button 
                        onClick={handleConfirm}
                        disabled={status === 'loading'}
                        className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all flex justify-center items-center h-12 disabled:bg-indigo-300 disabled:cursor-not-allowed">
                        {status === 'loading' ? <LoadingSpinner /> : 'Weryfikuj klucz'}
                    </button>
                </div>
                <p className="text-xs text-slate-500 text-center mt-4">
                    Nie masz klucza? <a href="#" className="font-medium text-indigo-600 hover:underline">Skontaktuj się z nami</a>.
                </p>
            </>
        );
    };
    
    return (
        <Modal isOpen={isOpen} onClose={handleClose}>
            {renderContent()}
        </Modal>
    );
};


// --- MAIN CALCULATOR APP ---
const CalculatorPage: FC = () => {
    const [step, setStep] = useState<'selection' | 'customization' | 'form' | 'booked'>('selection');
    const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
    const [customizedItems, setCustomizedItems] = useState<string[]>([]);
    const [totalPrice, setTotalPrice] = useState(0);
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [validatedAccessKey, setValidatedAccessKey] = useState('');
    const [finalBookingId, setFinalBookingId] = useState<number | null>(null);
    
    const selectedPackage = PACKAGES.find(p => p.id === selectedPackageId);

    useEffect(() => {
        if (!selectedPackage) {
            setTotalPrice(0);
            return;
        }
        let calculatedPrice = selectedPackage.price;
        const baseItemIds = new Set(selectedPackage.included.map(i => i.id));
        customizedItems.forEach(itemId => {
            if (!baseItemIds.has(itemId)) {
                const addon = ALL_ADDONS.find(a => a.id === itemId);
                if (addon && addon.price) calculatedPrice += addon.price;
            }
        });
        selectedPackage.included.forEach(item => {
            if (!item.locked && !customizedItems.includes(item.id)) {
                if(item.price) calculatedPrice -= item.price;
            }
        });
        setTotalPrice(calculatedPrice);
    }, [selectedPackage, customizedItems]);

    const handleSelectPackage = (packageId: string) => {
        setSelectedPackageId(packageId);
        const initialItems = PACKAGES.find(p => p.id === packageId)?.included.map(i => i.id) || [];
        setCustomizedItems(initialItems);
        setStep('customization');
    };
    
    const handleKeyValidated = (accessKey: string) => {
        setValidatedAccessKey(accessKey);
        setIsBookingModalOpen(false);
        setStep('form');
    };

    const handleBookingComplete = (bookingId: number) => {
        setFinalBookingId(bookingId);
        setStep('booked');
    };

    const handleItemToggle = (itemId: string) => {
        setCustomizedItems(prev =>
            prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
        );
    };

    const getAvailableAddons = () => {
        if (!selectedPackage) return [];
        const packageItemIds = new Set(selectedPackage.included.map(i => i.id));
        return ALL_ADDONS.filter(addon => !packageItemIds.has(addon.id));
    };
    
    const resetCalculator = () => {
        setStep('selection');
        setSelectedPackageId(null);
        setCustomizedItems([]);
        setTotalPrice(0);
        setFinalBookingId(null);
        setValidatedAccessKey('');
    }

    if (step === 'booked') {
        return (
            <div className="text-center py-20">
                 <CheckCircleIcon className="w-24 h-24 text-green-500 mx-auto mb-6" />
                 <h1 className="text-4xl font-bold tracking-tight text-slate-900">Dziękujemy za rezerwację!</h1>
                 <p className="mt-4 text-lg text-slate-600">
                    Twoja rezerwacja o numerze <span className="font-bold text-indigo-600">#{finalBookingId}</span> została pomyślnie zapisana.
                 </p>
                 <p className="mt-2 text-slate-600">Wkrótce skontaktujemy się z Tobą w celu omówienia szczegółów.</p>
                 <button 
                    onClick={resetCalculator}
                    className="mt-8 bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-transform hover:scale-105">
                    Stwórz nową kalkulację
                </button>
            </div>
        );
    }

    if (step === 'form') {
        return (
            <BookingForm
                bookingDetails={{
                    accessKey: validatedAccessKey,
                    packageName: selectedPackage?.name || '',
                    totalPrice: totalPrice,
                    selectedItems: customizedItems,
                }}
                onBookingComplete={handleBookingComplete}
                onBack={() => setStep('customization')}
            />
        );
    }
    
    const renderSelectionScreen = () => (
        <div>
            <header className="text-center mb-10">
                <h1 className="text-4xl font-bold tracking-tight text-slate-900">Wybierz swój pakiet</h1>
                <p className="mt-2 text-lg text-slate-600">Zacznij od pakietu bazowego i dostosuj go do swoich potrzeb.</p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {PACKAGES.map(pkg => (
                    <PackageCard key={pkg.id} packageInfo={pkg} onSelect={handleSelectPackage} />
                ))}
            </div>
        </div>
    );

    const renderCustomizationScreen = () => {
       if (!selectedPackage) return null;
       const availableAddons = getAvailableAddons();

       return (
            <div>
                 <header className="relative text-center mb-10">
                     <button 
                        onClick={() => setStep('selection')} 
                        className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors group">
                        <ArrowLeftIcon className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" />
                         Zmień pakiet
                     </button>
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Dostosuj swój pakiet</h1>
                    <p className="mt-2 text-lg text-slate-600">Wybrałeś <span className="font-bold text-indigo-600">{selectedPackage.name}</span>. Dodaj lub usuń elementy poniżej.</p>
                </header>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 lg:gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        <section>
                            <h2 className="text-xl font-semibold text-slate-800 mb-4">Elementy w Twoim pakiecie</h2>
                             <div className="space-y-3">
                                {selectedPackage.included.map(item => (
                                    <CustomizationListItem key={item.id} item={item} isSelected={customizedItems.includes(item.id)} onToggle={handleItemToggle} />
                                ))}
                            </div>
                        </section>
                        
                        {availableAddons.length > 0 && (
                            <section>
                                <h2 className="text-xl font-semibold text-slate-800 mb-4">Dostępne dodatki</h2>
                                <div className="space-y-3">
                                    {availableAddons.map(addon => (
                                         <CustomizationListItem key={addon.id} item={addon} isSelected={customizedItems.includes(addon.id)} onToggle={handleItemToggle} />
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                    <div className="lg:col-span-1 mt-8 lg:mt-0">
                        <div className="sticky top-8 bg-white rounded-2xl shadow-lg p-6 lg:p-8">
                            <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Twoja wycena</h3>
                            <p className="text-center text-sm text-slate-500 mb-6">Na podstawie <span className="font-semibold">{selectedPackage.name}</span></p>
                            
                            <div className="mt-6 border-t border-slate-200 pt-6">
                                <div className="flex justify-between items-center text-2xl font-bold">
                                    <span className="text-slate-900">Suma</span>
                                    <span className="text-indigo-600">{formatCurrency(totalPrice)}</span>
                                </div>
                            </div>
                             
                            <div className="mt-6 space-y-3">
                                <button 
                                    onClick={() => setIsBookingModalOpen(true)}
                                    className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-transform hover:scale-105">
                                    Przejdź do rezerwacji
                                </button>
                                <button className="w-full bg-slate-100 text-slate-700 font-bold py-3 px-4 rounded-lg hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition">
                                    Zapisz jako wersję roboczą
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
       );
    };

    return (
        <>
            {step === 'selection' ? renderSelectionScreen() : renderCustomizationScreen()}
            <BookingModal 
                isOpen={isBookingModalOpen} 
                onClose={() => setIsBookingModalOpen(false)}
                onKeyValidated={handleKeyValidated}
            />
        </>
    );
};

export default CalculatorPage;
