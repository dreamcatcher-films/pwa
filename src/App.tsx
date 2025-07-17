
import React, { useState, useEffect } from 'react';

// --- ICONS ---
const CheckCircleIcon = ({ className = 'w-6 h-6' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
    </svg>
);
const PlusCircleIcon = ({ className = 'w-6 h-6' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
const MinusCircleIcon = ({ className = 'w-6 h-6' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
const ArrowLeftIcon = ({ className = 'w-5 h-5' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
);
const XMarkIcon = ({ className = "w-6 h-6" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);
const LoadingSpinner = ({ className = "w-6 h-6" }) => (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


// --- DATA STRUCTURE ---
const PACKAGES = [
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

const ALL_ADDONS = [
    { id: 'pre_wedding', name: 'Sesja narzeczeńska', price: 600 },
    { id: 'drone', name: 'Ujęcia z drona', price: 400 },
    { id: 'social', name: 'Teledysk dla social media', price: 350 },
    { id: 'guest_interviews', name: 'Wywiady z gośćmi', price: 300 },
    { id: 'smoke_candles', name: 'Świece dymne', price: 150 },
];

const formatCurrency = (value) => value.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });

// --- UI COMPONENTS ---
const PackageCard = ({ packageInfo, onSelect }) => (
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

const CustomizationListItem = ({ item, isSelected, onToggle }) => (
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

const Modal = ({ isOpen, onClose, children }) => {
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

const BookingModal = ({ isOpen, onClose, onConfirm }) => {
    const [accessKey, setAccessKey] = useState('');
    const [error, setError] = useState('');
    const [status, setStatus] = useState('idle'); // 'idle', 'loading', 'success', 'error'

    const handleConfirm = async () => {
        setError('');
        setStatus('loading');

        // This is where we will call our backend on Render.
        // We use an environment variable for the API URL for security and flexibility.
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'; // Fallback for local dev

        try {
            const response = await fetch(`${apiUrl}/api/validate-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: accessKey }),
            });

            if (response.status === 404) {
                 // For demonstration: Simulate success for '1234' if the backend is not running
                if (accessKey === '1234') {
                     setStatus('success');
                } else {
                    setError('Usługa backendu jest niedostępna, ale klucz symulowany (1234) nie pasuje.');
                    setStatus('error');
                }
                return;
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Nieprawidłowy klucz dostępu.');
            }
            
            // Success
            setStatus('success');

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            setStatus('error');
        }
    };
    
    useEffect(() => {
        if (status === 'success') {
            const timer = setTimeout(() => {
                onConfirm(accessKey);
                handleClose();
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [status]);


    const handleClose = () => {
        setAccessKey('');
        setError('');
        setStatus('idle');
        onClose();
    }

    const renderContent = () => {
        switch (status) {
            case 'success':
                return (
                    <div className="text-center">
                        <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4 animate-pulse" />
                        <h2 className="text-2xl font-bold text-slate-900">Sukces!</h2>
                        <p className="text-slate-600 mt-2">Klucz zweryfikowany. Rezerwacja została potwierdzona.</p>
                    </div>
                );
            default:
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
                                {status === 'loading' ? <LoadingSpinner /> : 'Potwierdź rezerwację'}
                            </button>
                        </div>

                        <p className="text-xs text-slate-500 text-center mt-4">
                            Nie masz klucza? <a href="#" className="font-medium text-indigo-600 hover:underline">Skontaktuj się z nami</a>.
                        </p>
                    </>
                );
        }
    };
    
    return (
        <Modal isOpen={isOpen} onClose={handleClose}>
            {renderContent()}
        </Modal>
    );
};


// --- MAIN CALCULATOR APP ---
export const App = () => {
    const [currentStep, setCurrentStep] = useState('selection'); // 'selection' or 'customization'
    const [selectedPackageId, setSelectedPackageId] = useState(null);
    const [customizedItems, setCustomizedItems] = useState([]);
    const [totalPrice, setTotalPrice] = useState(0);
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

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
                if (addon) calculatedPrice += addon.price;
            }
        });

        selectedPackage.included.forEach(item => {
            if (!item.locked && !customizedItems.includes(item.id)) {
                calculatedPrice -= item.price;
            }
        });

        setTotalPrice(calculatedPrice);
    }, [selectedPackage, customizedItems]);

    const handleSelectPackage = (packageId) => {
        setSelectedPackageId(packageId);
        const initialItems = PACKAGES.find(p => p.id === packageId)?.included.map(i => i.id) || [];
        setCustomizedItems(initialItems);
        setCurrentStep('customization');
    };
    
    const handleConfirmBooking = (accessKey) => {
        console.log("Booking confirmed with access key:", accessKey);
        // Here we will later send the full booking data to the backend API
    };

    const handleItemToggle = (itemId) => {
        setCustomizedItems(prev =>
            prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
        );
    };

    const getAvailableAddons = () => {
        if (!selectedPackage) return [];
        const packageItemIds = new Set(selectedPackage.included.map(i => i.id));
        return ALL_ADDONS.filter(addon => !packageItemIds.has(addon.id));
    };

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
                        onClick={() => setCurrentStep('selection')} 
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
            <div className="min-h-screen bg-slate-50 font-sans p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto">
                    {currentStep === 'selection' ? renderSelectionScreen() : renderCustomizationScreen()}
                </div>
            </div>
            <BookingModal 
                isOpen={isBookingModalOpen} 
                onClose={() => setIsBookingModalOpen(false)}
                onConfirm={handleConfirmBooking}
            />
        </>
    );
};
