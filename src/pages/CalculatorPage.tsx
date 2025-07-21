
import React, { useState, useEffect, FC, ReactNode } from 'react';
import { CheckCircleIcon, PlusCircleIcon, MinusCircleIcon, LoadingSpinner, XMarkIcon, ArrowLeftIcon, ClipboardIcon, FilmIcon, CameraIcon, PhotoIcon } from '../components/Icons.tsx';
import BookingForm from '../components/BookingForm.tsx';
import { formatCurrency, copyToClipboard } from '../utils.ts';
import { Page } from '../App.tsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- DATA STRUCTURE ---
interface Addon {
    id: number;
    name: string;
    price: number;
}

interface PackageAddon extends Addon {
    locked: boolean;
}

interface Category {
    id: number;
    name: string;
    description: string;
    icon_name: string;
}

interface Package {
    id: number;
    name: string;
    price: number;
    description: string;
    category_id: number;
    included: PackageAddon[];
    rich_description: string;
    rich_description_image_url: string;
}

const iconMap: { [key: string]: React.ReactNode } = {
    'FilmIcon': <FilmIcon className="w-8 h-8 text-indigo-500" />,
    'CameraIcon': <CameraIcon className="w-8 h-8 text-indigo-500" />,
    'FilmCameraIcon': <div className="flex justify-center items-center"><FilmIcon className="w-7 h-7 text-indigo-500" /><CameraIcon className="w-7 h-7 text-indigo-500" /></div>,
    'default': <PhotoIcon className="w-8 h-8 text-indigo-500" />
};

// --- UI COMPONENTS ---
const StepIndicator: FC<{ currentStep: number; steps: string[] }> = ({ currentStep, steps }) => (
    <nav aria-label="Progress">
        <ol role="list" className="flex items-center">
            {steps.map((step, stepIdx) => (
                <li key={step} className={`relative ${stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''}`}>
                    {stepIdx < currentStep ? (
                        <>
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="h-0.5 w-full bg-indigo-600" />
                            </div>
                            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
                                <CheckCircleIcon className="h-5 w-5 text-white" />
                            </div>
                            <span className="absolute -bottom-7 w-max text-center text-xs font-semibold text-indigo-600">{step}</span>
                        </>
                    ) : stepIdx === currentStep ? (
                        <>
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="h-0.5 w-full bg-slate-200" />
                            </div>
                            <div className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-indigo-600 bg-white">
                                <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                            </div>
                             <span className="absolute -bottom-7 w-max text-center text-xs font-semibold text-indigo-600">{step}</span>
                        </>
                    ) : (
                        <>
                             <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="h-0.5 w-full bg-slate-200" />
                            </div>
                            <div className="group relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-300 bg-white">
                                <span className="h-2.5 w-2.5 rounded-full bg-transparent" />
                            </div>
                             <span className="absolute -bottom-7 w-max text-center text-xs font-semibold text-slate-500">{step}</span>
                        </>
                    )}
                </li>
            ))}
        </ol>
    </nav>
);


const ServiceTypeCard: FC<{ title: string; icon: ReactNode; onClick: () => void }> = ({ title, icon, onClick }) => (
    <div
        onClick={onClick}
        className="group cursor-pointer rounded-2xl border-2 border-slate-200 bg-white p-8 text-center transition-all duration-300 hover:border-indigo-400 hover:shadow-xl hover:-translate-y-2"
    >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 transition-colors group-hover:bg-indigo-100">
            {icon}
        </div>
        <h3 className="mt-6 text-xl font-bold text-slate-800 transition-colors group-hover:text-indigo-600">{title}</h3>
    </div>
);


const PackageCard: FC<PackageCardProps> = ({ packageInfo, onSelect }) => (
    <div
        onClick={() => onSelect(packageInfo)}
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
interface PackageCardProps {
    packageInfo: Package;
    onSelect: (pkg: Package) => void;
}


interface CustomizationListItemProps {
    item: PackageAddon;
    isSelected: boolean;
    onToggle: (itemId: number) => void;
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
            {item.price > 0 && !item.locked && (
                <span className="font-semibold text-slate-800">{formatCurrency(item.price)}</span>
            )}
        </div>
    </div>
);

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    size?: 'md' | 'lg';
}
const Modal: FC<ModalProps> = ({ isOpen, onClose, children, size = 'md' }) => {
    if (!isOpen) return null;
    const sizeClass = size === 'lg' ? 'max-w-2xl' : 'max-w-md';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" aria-modal="true" role="dialog">
            <div className={`bg-white rounded-2xl shadow-2xl p-8 w-full relative transform transition-all duration-300 scale-95 animate-modal-in ${sizeClass}`}>
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

        try {
            const response = await fetch('/api/validate-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: accessKey }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Nieprawidłowy klucz dostępu.');
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

interface MarketingModalProps {
    pkg: Package | null;
    onClose: () => void;
    onContinue: () => void;
}
const MarketingModal: FC<MarketingModalProps> = ({ pkg, onClose, onContinue }) => {
    if (!pkg) return null;
    return (
        <Modal isOpen={!!pkg} onClose={onClose} size="lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <img src={pkg.rich_description_image_url} alt={pkg.name} className="rounded-lg object-cover w-full h-96" />
                <div className="flex flex-col h-full">
                    <h2 className="text-3xl font-bold text-slate-900">{pkg.name}</h2>
                    <div className="mt-4 text-slate-600 flex-grow overflow-y-auto max-h-60 pr-2 prose prose-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{pkg.rich_description}</ReactMarkdown>
                    </div>
                    <div className="mt-6 pt-6 border-t flex justify-end gap-3">
                        <button onClick={onClose} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg">Wróć</button>
                        <button onClick={onContinue} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Kontynuuj</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};


// --- MAIN CREATOR APP ---
interface CalculatorPageProps {
    navigateTo: (page: Page) => void;
}

const STEPS = ['Usługa', 'Pakiet', 'Dostosowanie', 'Rezerwacja'];

const CalculatorPage: FC<CalculatorPageProps> = ({ navigateTo }) => {
    const [step, setStep] = useState<'serviceType' | 'selection' | 'customization' | 'form' | 'booked'>('serviceType');
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
    const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
    const [customizedItems, setCustomizedItems] = useState<number[]>([]);
    const [totalPrice, setTotalPrice] = useState(0);
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [validatedAccessKey, setValidatedAccessKey] = useState('');
    const [finalBookingId, setFinalBookingId] = useState<number | null>(null);
    const [finalClientId, setFinalClientId] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);
    const [marketingModalPkg, setMarketingModalPkg] = useState<Package | null>(null);

    // Dynamic offer state
    const [categories, setCategories] = useState<Category[]>([]);
    const [packages, setPackages] = useState<Package[]>([]);
    const [allAddons, setAllAddons] = useState<Addon[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    
    const currentStepIndex = () => {
        switch(step) {
            case 'serviceType': return 0;
            case 'selection': return 1;
            case 'customization': return 2;
            case 'form': return 3;
            default: return 0;
        }
    };

    useEffect(() => {
        const fetchOffer = async () => {
            setIsLoading(true);
            setError('');
            try {
                const response = await fetch('/api/packages');
                if (!response.ok) {
                    throw new Error(await response.text() || `Błąd ładowania oferty.`);
                }
                const data = await response.json();
                setCategories(data.categories);
                setPackages(data.packages);
                setAllAddons(data.allAddons);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Nie można załadować oferty. Spróbuj ponownie później.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchOffer();
    }, []);
    

    useEffect(() => {
        if (!selectedPackage) {
            setTotalPrice(0);
            return;
        }

        let finalPrice = selectedPackage.price;

        const addonMap = new Map(allAddons.map(a => [a.id, { ...a, locked: false }]));
        selectedPackage.included.forEach(i => addonMap.set(i.id, i));

        customizedItems.forEach(itemId => {
            const item = addonMap.get(itemId);
            if (item && !item.locked) {
                finalPrice += item.price;
            }
        });

        setTotalPrice(finalPrice);
    }, [selectedPackage, customizedItems, allAddons]);

    const handleSelectServiceType = (categoryId: number) => {
        setSelectedCategoryId(categoryId);
        setStep('selection');
    }

    const handleSelectPackage = (pkg: Package) => {
        setMarketingModalPkg(pkg);
    };

    const handleContinueFromMarketing = () => {
        if (marketingModalPkg) {
            setSelectedPackage(marketingModalPkg);
            const initialItems = marketingModalPkg.included.map(i => i.id) || [];
            setCustomizedItems(initialItems);
            setStep('customization');
            setMarketingModalPkg(null);
        }
    };
    
    const handleKeyValidated = (accessKey: string) => {
        setValidatedAccessKey(accessKey);
        setIsBookingModalOpen(false);
        setStep('form');
    };

    const handleBookingComplete = (data: {bookingId: number, clientId: string}) => {
        setFinalBookingId(data.bookingId);
        setFinalClientId(data.clientId);
        setStep('booked');
    };

    const handleItemToggle = (itemId: number) => {
        setCustomizedItems(prev =>
            prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
        );
    };

    const getAvailableAddons = (): PackageAddon[] => {
        if (!selectedPackage) return [];
        const packageItemIds = new Set(selectedPackage.included.map(i => i.id));
        return allAddons
            .filter(addon => !packageItemIds.has(addon.id))
            .map(addon => ({ ...addon, locked: false }));
    };
    
    const resetCalculator = () => {
        setStep('serviceType');
        setSelectedCategoryId(null);
        setSelectedPackage(null);
        setCustomizedItems([]);
        setTotalPrice(0);
        setFinalBookingId(null);
        setFinalClientId(null);
        setValidatedAccessKey('');
    }

    const handleCopyToClipboard = () => {
        if (finalClientId) {
            copyToClipboard(finalClientId);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        }
    };
    
    const filteredPackages = selectedCategoryId ? packages.filter(p => p.category_id === selectedCategoryId) : [];

    if (isLoading) {
        return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    }

    if (error) {
         return <div className="text-center py-20"><p className="text-red-500">{error}</p></div>;
    }

    if (step === 'booked') {
        return (
            <div className="max-w-2xl mx-auto text-center py-20">
                 <CheckCircleIcon className="w-24 h-24 text-green-500 mx-auto mb-6" />
                 <h1 className="text-4xl font-bold tracking-tight text-slate-900">Rezerwacja zakończona sukcesem!</h1>
                 <p className="mt-4 text-lg text-slate-600">
                    Twoje konto zostało utworzone. Wkrótce skontaktujemy się z Tobą w celu omówienia szczegółów.
                 </p>
                 
                 <div className="mt-8 bg-indigo-50 border border-indigo-200 rounded-lg p-6 space-y-4">
                     <h2 className="text-xl font-semibold text-slate-800">Twoje dane do logowania</h2>
                     <p className="text-slate-600">Zapisz je w bezpiecznym miejscu. Będą potrzebne, aby uzyskać dostęp do Twojego panelu klienta.</p>
                     
                     <div className="text-left space-y-3">
                         <div>
                            <span className="font-semibold text-slate-700">Numer rezerwacji:</span>
                            <span className="font-bold text-indigo-600 ml-2">#{finalBookingId}</span>
                         </div>
                         <div>
                             <span className="font-semibold text-slate-700">Twój numer klienta:</span>
                             <div className="flex items-center gap-2 mt-1">
                                <span className="font-bold text-2xl text-indigo-600 tracking-widest bg-white px-3 py-1 rounded-md border">{finalClientId}</span>
                                <button onClick={handleCopyToClipboard} className="p-2 rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors" aria-label="Kopiuj numer klienta">
                                    <ClipboardIcon className="w-5 h-5" />
                                </button>
                                {copySuccess && <span className="text-sm text-green-600">Skopiowano!</span>}
                             </div>
                         </div>
                         <div>
                             <span className="font-semibold text-slate-700">Twoje hasło:</span>
                             <span className="text-slate-800 ml-2">[Ustawione w poprzednim kroku]</span>
                         </div>
                     </div>
                 </div>

                 <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
                     <button 
                        onClick={() => navigateTo('login')}
                        className="bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-transform hover:scale-105">
                        Przejdź do Panelu Klienta
                    </button>
                    <button 
                        onClick={resetCalculator}
                        className="bg-slate-200 text-slate-800 font-bold py-3 px-6 rounded-lg hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition">
                        Stwórz nowy pakiet
                    </button>
                </div>
            </div>
        );
    }
    
    let headerContent, mainContent;

    switch(step) {
        case 'serviceType':
            headerContent = (
                <header className="text-center">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Stwórz Swój Pakiet</h1>
                    <p className="mt-2 text-lg text-slate-600">Zacznijmy od wyboru usługi, która Cię interesuje.</p>
                </header>
            );
            mainContent = (
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
                    {categories.map(cat => (
                        <ServiceTypeCard key={cat.id} title={cat.name} icon={iconMap[cat.icon_name] || iconMap.default} onClick={() => handleSelectServiceType(cat.id)} />
                    ))}
                </div>
            );
            break;
        case 'selection':
            headerContent = (
                <header className="relative text-center">
                    <button 
                        onClick={() => setStep('serviceType')} 
                        className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors group">
                        <ArrowLeftIcon className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" />
                         Wróć
                    </button>
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Wybierz swój pakiet</h1>
                    <p className="mt-2 text-lg text-slate-600">Zacznij od pakietu bazowego i dostosuj go do swoich potrzeb.</p>
                </header>
            );
            mainContent = (
                <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPackages.map(pkg => (
                            <PackageCard key={pkg.id} packageInfo={pkg} onSelect={handleSelectPackage} />
                        ))}
                    </div>
                    {filteredPackages.length === 0 && (
                        <div className="text-center py-12 text-slate-500">
                            <p>Brak dostępnych pakietów dla wybranej usługi.</p>
                        </div>
                    )}
                </div>
            );
            break;
        case 'customization':
            if (selectedPackage) {
                const availableAddons = getAvailableAddons();
                headerContent = (
                    <header className="relative text-center">
                        <button 
                            onClick={() => setStep('selection')} 
                            className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors group">
                            <ArrowLeftIcon className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" />
                             Zmień pakiet
                        </button>
                        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Dostosuj swój pakiet</h1>
                        <p className="mt-2 text-lg text-slate-600">Wybrałeś <span className="font-bold text-indigo-600">{selectedPackage.name}</span>. Dodaj lub usuń elementy poniżej.</p>
                    </header>
                );
                mainContent = (
                     <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 lg:gap-8">
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
                            <div className="sticky top-28 bg-white rounded-2xl shadow-lg p-6 lg:p-8">
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
                );
            }
            break;
        case 'form':
            headerContent = (
                <header className="relative text-center">
                    <button onClick={() => setStep('customization')} className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors group">
                        <ArrowLeftIcon className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" /> Wróć do kalkulatora
                    </button>
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Szczegóły Rezerwacji</h1>
                    <p className="mt-2 text-lg text-slate-600">Uzupełnij poniższe informacje, aby dokończyć rezerwację.</p>
                </header>
            );
            mainContent = (
                <div className="max-w-4xl mx-auto">
                    <BookingForm
                        bookingDetails={{
                            accessKey: validatedAccessKey,
                            packageName: selectedPackage?.name || '',
                            totalPrice: totalPrice,
                            selectedItems: customizedItems.map(id => allAddons.find(a => a.id === id)?.name || '').filter(Boolean),
                        }}
                        onBookingComplete={handleBookingComplete}
                    />
                </div>
            );
            break;
    }

    return (
        <div className="py-8">
            {headerContent}
            <div className="my-10 flex justify-center">
                 <StepIndicator currentStep={currentStepIndex()} steps={STEPS} />
            </div>
            {mainContent}
            <BookingModal 
                isOpen={isBookingModalOpen} 
                onClose={() => setIsBookingModalOpen(false)}
                onKeyValidated={handleKeyValidated}
            />
            <MarketingModal
                pkg={marketingModalPkg}
                onClose={() => setMarketingModalPkg(null)}
                onContinue={handleContinueFromMarketing}
            />
        </div>
    );
};

export default CalculatorPage;
