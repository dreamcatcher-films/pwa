import React, { useState, useEffect, FC, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircleIcon, PlusCircleIcon, MinusCircleIcon, EngagementRingSpinner, XMarkIcon, ArrowLeftIcon, ClipboardIcon, FilmIcon, CameraIcon, PhotoIcon, InformationCircleIcon } from '../components/Icons.tsx';
import BookingForm from '../components/BookingForm.tsx';
import { formatCurrency, copyToClipboard } from '../utils.ts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPackages, getContactDetails } from '../api.ts';

// --- DATA STRUCTURE ---
type AddonType = 'static' | 'quantity' | 'range';

interface AddonConfig {
    unitName?: string;
    pricePerUnit?: number;
    includedAmount?: number;
    pricePerBlock?: number;
    blockSize?: number;
    maxAmount?: number;
}

interface Addon {
    id: number;
    name: string;
    price: number;
    category_ids?: number[];
    type: AddonType;
    config: AddonConfig;
}

interface PackageAddon extends Addon {
    locked: boolean;
}

interface Category {
    id: number;
    name: string;
    description: string;
    icon_name: string;
    label: string | null;
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
    label: string | null;
    deposit_amount: number;
}

interface OfferData {
    categories: Category[];
    packages: Package[];
    allAddons: Addon[];
}

// --- UI COMPONENTS ---
const iconMap: { [key: string]: React.ReactNode } = {
    'FilmIcon': <FilmIcon className="w-8 h-8 text-indigo-500" />,
    'CameraIcon': <CameraIcon className="w-8 h-8 text-indigo-500" />,
    'FilmCameraIcon': <div className="flex justify-center items-center"><FilmIcon className="w-7 h-7 text-indigo-500" /><CameraIcon className="w-7 h-7 text-indigo-500" /></div>,
    'default': <PhotoIcon className="w-8 h-8 text-indigo-500" />
};

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
                            <span className="absolute -bottom-7 left-4 -translate-x-1/2 whitespace-nowrap text-center text-xs font-semibold text-indigo-600">{step}</span>
                        </>
                    ) : stepIdx === currentStep ? (
                        <>
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="h-0.5 w-full bg-slate-200" />
                            </div>
                            <div className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-indigo-600 bg-white">
                                <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                            </div>
                             <span className="absolute -bottom-7 left-4 -translate-x-1/2 whitespace-nowrap text-center text-xs font-semibold text-indigo-600">{step}</span>
                        </>
                    ) : (
                        <>
                             <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="h-0.5 w-full bg-slate-200" />
                            </div>
                            <div className="group relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-300 bg-white">
                                <span className="h-2.5 w-2.5 rounded-full bg-transparent" />
                            </div>
                             <span className="absolute -bottom-7 left-4 -translate-x-1/2 whitespace-nowrap text-center text-xs font-semibold text-slate-500">{step}</span>
                        </>
                    )}
                </li>
            ))}
        </ol>
    </nav>
);

const ServiceTypeCard: FC<{ category: Category; onClick: () => void }> = ({ category, onClick }) => (
    <div
        onClick={onClick}
        className="group relative cursor-pointer rounded-2xl border-2 border-slate-200 bg-white p-8 text-center transition-all duration-300 hover:border-indigo-400 hover:shadow-xl hover:-translate-y-2"
    >
        {category.label && (
            <div className="absolute top-4 right-4 bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-full">{category.label}</div>
        )}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 transition-colors group-hover:bg-indigo-100">
            {iconMap[category.icon_name] || iconMap.default}
        </div>
        <h3 className="mt-6 text-xl font-bold text-slate-800 transition-colors group-hover:text-indigo-600">{category.name}</h3>
    </div>
);

interface PackageCardProps {
    packageInfo: Package;
    onSelect: (pkg: Package) => void;
}

const PackageCard: FC<PackageCardProps> = ({ packageInfo, onSelect }) => (
    <div
        onClick={() => onSelect(packageInfo)}
        className="relative cursor-pointer border-2 p-6 rounded-2xl transition-all duration-300 bg-white hover:border-indigo-400 hover:shadow-xl transform hover:-translate-y-1 flex flex-col"
    >
        {packageInfo.label && (
             <div className={`absolute top-0 -translate-y-1/2 left-6 text-xs font-bold px-3 py-1 rounded-full ${packageInfo.label.toLowerCase() === 'bestseller' ? 'bg-amber-400 text-amber-900' : 'bg-indigo-500 text-white'}`}>{packageInfo.label}</div>
        )}
        <div className="flex-grow">
            <h3 className="text-xl font-bold text-slate-800">{packageInfo.name}</h3>
            <p className="text-sm text-slate-500 mt-2 min-h-[40px]">{packageInfo.description}</p>
            <p className="text-2xl font-bold text-slate-900 mt-4">{formatCurrency(packageInfo.price)}</p>
            <ul className="mt-4 space-y-2 text-sm">
                {packageInfo.included.slice(0, 4).map(item => (
                    <li key={item.id} className="flex items-center text-slate-600">
                        <CheckCircleIcon className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" />
                        <span>{item.name}</span>
                    </li>
                ))}
            </ul>
        </div>
        {packageInfo.included.length > 4 && (
            <p className="text-xs text-slate-500 font-semibold mt-3 text-center">+ {packageInfo.included.length - 4} innych elementów</p>
        )}
    </div>
);
interface CustomizationListItemProps {
    item: PackageAddon;
    isSelected: boolean;
    onToggle?: (itemId: number) => void;
    value?: number;
    onValueChange?: (itemId: number, value: number) => void;
}
const CustomizationListItem: FC<CustomizationListItemProps> = ({ item, isSelected, onToggle, value, onValueChange }) => {
    const { type, config } = item;
    
    const handleValueChange = (newValue: number) => {
        if (!onValueChange) return;

        let clampedValue = newValue;
        if (type === 'range') {
            const min = config.includedAmount || 0;
            const max = config.maxAmount || Infinity;
            clampedValue = Math.max(min, Math.min(max, newValue));
        } else if (type === 'quantity') {
            clampedValue = Math.max(0, newValue);
        }
        
        onValueChange(item.id, clampedValue);
    };
    
    return (
     <div className={`p-4 border rounded-lg transition-all duration-200 ${isSelected ? 'bg-indigo-50 border-indigo-300' : 'bg-white'}`}>
         <div className="flex items-center justify-between">
            <div className="flex items-center">
                {item.locked ? (
                    <CheckCircleIcon className="w-6 h-6 text-green-500 mr-3" />
                ) : type === 'static' && onToggle ? (
                     <button onClick={() => onToggle(item.id)} className="mr-3 focus:outline-none" aria-label={isSelected ? `Usuń ${item.name}` : `Dodaj ${item.name}`}>
                        {isSelected ? <MinusCircleIcon className="w-6 h-6 text-red-500 hover:text-red-700" /> : <PlusCircleIcon className="w-6 h-6 text-green-500 hover:text-green-700" />}
                    </button>
                ) : (
                    <div className="w-6 h-6 mr-3"></div>
                )}
                <div>
                     <span className="font-medium text-slate-800">{item.name}</span>
                     {item.locked && <span className="text-xs font-semibold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full ml-2">W pakiecie</span>}
                </div>
            </div>
            <div className="text-right">
                {type === 'static' && item.price > 0 && !item.locked && (
                    <span className="font-semibold text-slate-800">{formatCurrency(item.price)}</span>
                )}
            </div>
        </div>
        {isSelected && (type === 'quantity' || type === 'range') && (
            <div className="mt-3 pl-9">
                {type === 'quantity' && config.pricePerUnit && (
                    <div className="flex items-center gap-2">
                        <input type="number" value={value || 0} onChange={(e) => handleValueChange(Number(e.target.value))} className="w-24 p-1 border-slate-300 rounded-md text-center" />
                        <span className="text-sm text-slate-600">{config.unitName || 'szt.'} x {formatCurrency(config.pricePerUnit)}</span>
                    </div>
                )}
                {type === 'range' && config.includedAmount !== undefined && (
                     <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <input type="range" min={config.includedAmount} max={config.maxAmount} value={value} onChange={(e) => handleValueChange(Number(e.target.value))} className="w-full" step={config.blockSize || 1} />
                            <input type="number" value={value} onChange={(e) => handleValueChange(Number(e.target.value))} className="w-24 p-1 border-slate-300 rounded-md text-center"/>
                            <span className="text-sm text-slate-600">{config.unitName || 'km'}</span>
                        </div>
                        <p className="text-xs text-slate-500">W pakiecie: {config.includedAmount} {config.unitName}. Każde dodatkowe {config.blockSize} {config.unitName} kosztuje {formatCurrency(config.pricePerBlock || 0)}.</p>
                    </div>
                )}
            </div>
        )}
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
    onHelpClick: () => void;
}
const BookingModal: FC<BookingModalProps> = ({ isOpen, onClose, onKeyValidated, onHelpClick }) => {
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
                <p className="text-slate-600 text-center mt-2">
                    Twój 4-cyfrowy klucz dostępu jest potwierdzeniem naszej wcześniejszej rozmowy. Powinieneś/aś go otrzymać w wiadomości e-mail lub SMS.
                </p>
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
                        className="w-full bg-brand-dark-green text-white font-bold py-3 px-4 rounded-lg hover:bg-brand-dark-green/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-800 transition-all flex justify-center items-center h-12 disabled:bg-opacity-50 disabled:cursor-not-allowed">
                        {status === 'loading' ? <EngagementRingSpinner className="w-6 h-6" /> : 'Weryfikuj klucz'}
                    </button>
                </div>
                <p className="text-xs text-slate-500 text-center mt-4">
                    Nie masz klucza? <button type="button" onClick={onHelpClick} className="font-medium text-indigo-600 hover:underline focus:outline-none">Skontaktuj się z nami</button>.
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

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
    contactPhone?: string;
}
const HelpModal: FC<HelpModalProps> = ({ isOpen, onClose, contactPhone }) => {
    const navigate = useNavigate();

    const goToContactForm = () => {
        onClose();
        navigate('/kontakt');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <h2 className="text-2xl font-bold text-slate-900 text-center">Jak uzyskać klucz dostępu?</h2>
            <p className="text-slate-600 text-center mt-4">
                Jeśli nie otrzymałeś/aś od nas klucza, skontaktuj się z nami w najwygodniejszy dla Ciebie sposób.
            </p>
            <div className="mt-6 flex flex-col gap-4">
                <button
                    onClick={goToContactForm}
                    className="w-full bg-slate-100 text-slate-800 font-bold py-3 px-4 rounded-lg hover:bg-slate-200 transition-colors"
                >
                    Przejdź do formularza
                </button>
                {contactPhone && (
                    <a
                        href={`tel:${contactPhone.replace(/\s/g, '')}`}
                        className="w-full text-center bg-brand-dark-green text-white font-bold py-3 px-4 rounded-lg hover:bg-brand-dark-green/90 transition-colors"
                    >
                        Zadzwoń do nas ({contactPhone})
                    </a>
                )}
            </div>
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
                    <div className="mt-4 text-slate-600 flex-grow overflow-y-auto max-h-60 pr-2">
                        <div className="prose prose-sm">
                           <ReactMarkdown remarkPlugins={[remarkGfm]}>{pkg.rich_description}</ReactMarkdown>
                        </div>
                    </div>
                    <div className="mt-6 pt-6 border-t flex justify-end gap-3">
                        <button onClick={onClose} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg">Wróć</button>
                        <button onClick={onContinue} className="bg-brand-dark-green text-white font-bold py-2 px-4 rounded-lg">Kontynuuj</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};


// --- MAIN CREATOR APP ---
const STEPS = ['Usługa', 'Pakiet', 'Dostosuj', 'Rezerwuj'];

const CalculatorPage: FC = () => {
    const [step, setStep] = useState<'serviceType' | 'selection' | 'customization' | 'form' | 'booked'>('serviceType');
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
    const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
    const [customizedItems, setCustomizedItems] = useState<number[]>([]);
    const [dynamicAddonValues, setDynamicAddonValues] = useState<Record<number, number>>({});
    const [totalPrice, setTotalPrice] = useState(0);
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
    const [validatedAccessKey, setValidatedAccessKey] = useState('');
    const [finalBookingId, setFinalBookingId] = useState<number | null>(null);
    const [finalClientId, setFinalClientId] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);
    const [marketingModalPkg, setMarketingModalPkg] = useState<Package | null>(null);
    
    const navigate = useNavigate();
    
    const { data: offerData, isLoading, error } = useQuery<OfferData, Error>({
        queryKey: ['packages'],
        queryFn: getPackages
    });
    
    const { data: contactDetails } = useQuery({
        queryKey: ['contactDetails'],
        queryFn: getContactDetails,
    });
    
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
        if (!selectedPackage || !offerData) {
            setTotalPrice(0);
            return;
        }

        let finalPrice = Number(selectedPackage.price);

        const addonMap = new Map(offerData.allAddons.map(a => [a.id, a]));

        // Calculate price for static addons
        customizedItems.forEach(itemId => {
            const item = addonMap.get(itemId);
            const isIncluded = selectedPackage.included.some(inc => inc.id === itemId);
            if (item && !isIncluded && item.type === 'static') {
                finalPrice += Number(item.price);
            }
        });

        // Calculate price for dynamic addons
        for (const addonId in dynamicAddonValues) {
            const item = addonMap.get(Number(addonId));
            const value = dynamicAddonValues[addonId];
            if (item && item.config) {
                 if (item.type === 'quantity' && item.config.pricePerUnit) {
                    finalPrice += value * item.config.pricePerUnit;
                } else if (item.type === 'range' && item.config.includedAmount !== undefined) {
                    const extra = value - item.config.includedAmount;
                    if (extra > 0 && item.config.blockSize && item.config.pricePerBlock) {
                        const blocks = Math.ceil(extra / item.config.blockSize);
                        finalPrice += blocks * item.config.pricePerBlock;
                    }
                }
            }
        }
        setTotalPrice(finalPrice);

    }, [selectedPackage, customizedItems, dynamicAddonValues, offerData]);

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
            
            const initialStaticItems = marketingModalPkg.included.filter(i => i.type === 'static' || !i.type).map(i => i.id);
            const initialDynamicAddons: Record<number, number> = {};
            marketingModalPkg.included.forEach(item => {
                if (item.type === 'range' && item.config.includedAmount !== undefined) {
                    initialDynamicAddons[item.id] = item.config.includedAmount;
                }
            });

            setCustomizedItems(initialStaticItems);
            setDynamicAddonValues(initialDynamicAddons);
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
    
    const handleDynamicValueChange = (itemId: number, value: number) => {
        setDynamicAddonValues(prev => ({...prev, [itemId]: value}));
    };

    const getAvailableAddons = (): PackageAddon[] => {
        if (!selectedPackage || !offerData || !selectedCategoryId) return [];
        const packageItemIds = new Set(selectedPackage.included.map(i => i.id));
        
        return offerData.allAddons
            .filter(addon => {
                if (packageItemIds.has(addon.id)) {
                    return false;
                }
                if (!addon.category_ids || addon.category_ids.length === 0) {
                    return true;
                }
                return addon.category_ids.includes(selectedCategoryId);
            })
            .map(addon => ({ ...addon, locked: false }));
    };
    
    const getFinalSelectedItems = () => {
        if (!offerData) return { static: [], dynamic: [] };
        
        const addonMap = new Map(offerData.allAddons.map(a => [a.id, a]));
        
        const staticItems = customizedItems
            .map(id => addonMap.get(id)?.name)
            .filter(Boolean) as string[];

        const dynamicItems = Object.entries(dynamicAddonValues).map(([id, value]) => {
            const addon = addonMap.get(Number(id));
            if (!addon) return null;
            return {
                id: addon.id,
                name: addon.name,
                value: value,
                unit: addon.config.unitName || ''
            };
        }).filter(Boolean);

        return { static: staticItems, dynamic: dynamicItems };
    };
    
    const resetCalculator = () => {
        setStep('serviceType');
        setSelectedCategoryId(null);
        setSelectedPackage(null);
        setCustomizedItems([]);
        setDynamicAddonValues({});
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
    
    const filteredPackages = selectedCategoryId && offerData ? offerData.packages.filter(p => p.category_id === selectedCategoryId) : [];

    if (isLoading) {
        return <div className="flex justify-center items-center py-20"><EngagementRingSpinner /></div>;
    }

    if (error) {
         return <div className="text-center py-20"><p className="text-red-500">{error.message}</p></div>;
    }

    if (!offerData) {
        return <div className="text-center py-20">Brak oferty do wyświetlenia.</div>;
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
                        onClick={() => navigate('/logowanie')}
                        className="bg-brand-dark-green text-white font-bold py-3 px-6 rounded-lg hover:bg-brand-dark-green/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-800 transition-transform hover:scale-105">
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
    
    let headerContent, mainContent, backButton;

    switch(step) {
        case 'serviceType':
            headerContent = (
                <header className="text-center">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Stwórz Swój Pakiet</h1>
                    <p className="mt-2 text-lg text-slate-600">Zacznijmy od wyboru usługi, która Cię interesuje.</p>
                </header>
            );
            mainContent = (
                <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
                    {offerData.categories.map(cat => (
                        <ServiceTypeCard key={cat.id} category={cat} onClick={() => handleSelectServiceType(cat.id)} />
                    ))}
                </div>
            );
            break;
        case 'selection':
            backButton = (
                <button 
                    onClick={() => setStep('serviceType')} 
                    className="flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors group">
                    <ArrowLeftIcon className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" />
                     Wróć
                </button>
            );
            headerContent = (
                <header className="text-center">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Wybierz swój pakiet</h1>
                    <p className="mt-2 text-lg text-slate-600">Zacznij od pakietu bazowego i dostosuj go do swoich potrzeb.</p>
                </header>
            );
            mainContent = (
                <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                backButton = (
                     <button 
                        onClick={() => setStep('selection')} 
                        className="flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors group">
                        <ArrowLeftIcon className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" />
                         Zmień pakiet
                    </button>
                );
                headerContent = (
                    <header className="text-center">
                        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Dostosuj swój pakiet</h1>
                        <p className="mt-2 text-lg text-slate-600">Wybrałeś <span className="font-bold text-indigo-600">{selectedPackage.name}</span>. Dostosuj elementy poniżej.</p>
                    </header>
                );
                mainContent = (
                     <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 lg:gap-8">
                        <div className="lg:col-span-2 space-y-8">
                            <section>
                                <h2 className="text-xl font-semibold text-slate-800 mb-4">Elementy w Twoim pakiecie</h2>
                                 <div className="space-y-3">
                                    {selectedPackage.included.map(item => (
                                        <CustomizationListItem 
                                            key={item.id} 
                                            item={item} 
                                            isSelected={true}
                                            value={dynamicAddonValues[item.id]}
                                            onValueChange={handleDynamicValueChange}
                                        />
                                    ))}
                                </div>
                            </section>
                            
                            {availableAddons.length > 0 && (
                                <section>
                                    <h2 className="text-xl font-semibold text-slate-800 mb-4">Dostępne dodatki</h2>
                                    <div className="space-y-3">
                                        {availableAddons.map(addon => (
                                             <CustomizationListItem 
                                                key={addon.id} 
                                                item={addon} 
                                                isSelected={customizedItems.includes(addon.id) || dynamicAddonValues.hasOwnProperty(addon.id)} 
                                                onToggle={handleItemToggle}
                                                value={dynamicAddonValues[addon.id]}
                                                onValueChange={handleDynamicValueChange}
                                             />
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>
                        <div className="lg:col-span-1 mt-8 lg:mt-0">
                            <div className="sticky top-28 bg-white rounded-2xl shadow-lg p-6 lg:p-8">
                                <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Twoja wycena</h3>
                                <p className="text-center text-sm text-slate-500 mb-6">Na podstawie <span className="font-semibold">{selectedPackage.name}</span></p>
                                
                                <div className="space-y-3">
                                    {selectedPackage.deposit_amount > 0 && (
                                        <div className="flex justify-between items-center text-md">
                                            <span className="text-slate-600 flex items-center gap-1.5">
                                                Zadatek
                                                <div className="group relative">
                                                    <InformationCircleIcon className="w-4 h-4 text-slate-400"/>
                                                    <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 text-center text-xs bg-slate-700 text-white p-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">Wpłata zadatku jest warunkiem przyjęcia rezerwacji.</span>
                                                </div>
                                            </span>
                                            <span className="font-semibold text-slate-800">{formatCurrency(selectedPackage.deposit_amount)}</span>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="mt-3 border-t border-slate-200 pt-4">
                                    <div className="flex justify-between items-center text-2xl font-bold">
                                        <span className="text-slate-900">Suma</span>
                                        <span className="text-indigo-600">{formatCurrency(totalPrice)}</span>
                                    </div>
                                </div>
                                 
                                <div className="mt-6 space-y-3">
                                    <button 
                                        onClick={() => setIsBookingModalOpen(true)}
                                        className="w-full bg-brand-dark-green text-white font-bold py-3 px-4 rounded-lg hover:bg-brand-dark-green/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-800 transition-transform hover:scale-105">
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
            backButton = (
                <button onClick={() => setStep('customization')} className="flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors group">
                    <ArrowLeftIcon className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" /> Wróć do kalkulatora
                </button>
            );
            headerContent = (
                <header className="text-center">
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
                            selectedItems: getFinalSelectedItems(),
                            depositAmount: selectedPackage?.deposit_amount || 0,
                        }}
                        onBookingComplete={handleBookingComplete}
                    />
                </div>
            );
            break;
    }

    return (
        <div className="py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-8 mb-6">{backButton}</div>
            {headerContent}
            <div className="my-12 flex justify-center">
                 <StepIndicator currentStep={currentStepIndex()} steps={STEPS} />
            </div>
            {mainContent}
            <BookingModal 
                isOpen={isBookingModalOpen} 
                onClose={() => setIsBookingModalOpen(false)}
                onKeyValidated={handleKeyValidated}
                onHelpClick={() => {
                    setIsBookingModalOpen(false);
                    setIsHelpModalOpen(true);
                }}
            />
             <HelpModal
                isOpen={isHelpModalOpen}
                onClose={() => setIsHelpModalOpen(false)}
                contactPhone={contactDetails?.contact_phone}
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
