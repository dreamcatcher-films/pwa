
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


// --- DATA STRUCTURE FOR HYBRID MODEL ---
const PACKAGES = [
    {
        id: 'gold',
        name: 'Gold Package',
        price: 5200,
        description: 'The ultimate package for a complete and unforgettable memory.',
        included: [
            { id: 'film', name: 'Cinematic Film', locked: true },
            { id: 'photos', name: 'Full Day Photo Reportage', locked: true },
            { id: 'pre_wedding', name: 'Pre-wedding Session', locked: false, price: 600 },
            { id: 'drone', name: 'Drone Footage', locked: false, price: 400 },
            { id: 'social', name: 'Social Media Teaser', locked: false, price: 350 },
        ]
    },
    {
        id: 'silver',
        name: 'Silver Package',
        price: 4500,
        description: 'The most popular choice for comprehensive coverage.',
        included: [
            { id: 'film', name: 'Cinematic Film', locked: true },
            { id: 'photos', name: 'Full Day Photo Reportage', locked: true },
            { id: 'drone', name: 'Drone Footage', locked: false, price: 400 },
        ]
    },
    {
        id: 'bronze',
        name: 'Bronze Package',
        price: 3200,
        description: 'A beautiful cinematic film to capture your day.',
        included: [
            { id: 'film', name: 'Cinematic Film', locked: true },
        ]
    },
];

const ALL_ADDONS = [
    { id: 'pre_wedding', name: 'Pre-wedding Session', price: 600 },
    { id: 'drone', name: 'Drone Footage', price: 400 },
    { id: 'social', name: 'Social Media Teaser', price: 350 },
    { id: 'guest_interviews', name: 'Guest Interviews', price: 300 },
    { id: 'smoke_candles', name: 'Smoke Candles Effect', price: 150 },
];

// --- UI COMPONENTS ---
const PackageCard = ({ packageInfo, onSelect }) => (
    <div
        onClick={() => onSelect(packageInfo.id)}
        className="cursor-pointer border-2 p-6 rounded-2xl transition-all duration-300 bg-white hover:border-indigo-400 hover:shadow-xl transform hover:-translate-y-1"
    >
        <h3 className="text-xl font-bold text-slate-800">{packageInfo.name}</h3>
        <p className="text-sm text-slate-500 mt-2 min-h-[40px]">{packageInfo.description}</p>
        <p className="text-2xl font-bold text-slate-900 mt-4">${packageInfo.price.toLocaleString()}</p>
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
                 <button onClick={() => onToggle(item.id)} className="mr-3 focus:outline-none">
                    {isSelected ? <MinusCircleIcon className="w-6 h-6 text-red-500 hover:text-red-700" /> : <PlusCircleIcon className="w-6 h-6 text-green-500 hover:text-green-700" />}
                </button>
            )}
            <div>
                 <span className="font-medium text-slate-800">{item.name}</span>
                 {item.locked && <span className="text-xs font-semibold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full ml-2">Included</span>}
            </div>
        </div>
        <div className="text-right">
            {item.price !== undefined && (
                <span className="font-semibold text-slate-800">${item.price.toLocaleString()}</span>
            )}
        </div>
    </div>
);


// --- MAIN CALCULATOR APP ---
export const App = () => {
    const [currentStep, setCurrentStep] = useState('selection'); // 'selection' or 'customization'
    const [selectedPackageId, setSelectedPackageId] = useState(null);
    const [customizedItems, setCustomizedItems] = useState([]);
    const [totalPrice, setTotalPrice] = useState(0);

    const selectedPackage = PACKAGES.find(p => p.id === selectedPackageId);

    useEffect(() => {
        if (!selectedPackage) {
            setTotalPrice(0);
            return;
        }

        let calculatedPrice = selectedPackage.price;
        const baseItemIds = selectedPackage.included.map(i => i.id);

        // Add price for items not in base package
        customizedItems.forEach(itemId => {
            if (!baseItemIds.includes(itemId)) {
                const addon = ALL_ADDONS.find(a => a.id === itemId);
                if (addon) calculatedPrice += addon.price;
            }
        });

        // Subtract price for items deselected from base package
        baseItemIds.forEach(itemId => {
            const itemInfo = selectedPackage.included.find(i => i.id === itemId);
            if (itemInfo && !itemInfo.locked && !customizedItems.includes(itemId)) {
                calculatedPrice -= itemInfo.price;
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

    const handleItemToggle = (itemId) => {
        setCustomizedItems(prev =>
            prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
        );
    };

    const getAvailableAddons = () => {
        if (!selectedPackage) return [];
        const packageItemIds = selectedPackage.included.map(i => i.id);
        return ALL_ADDONS.filter(addon => !packageItemIds.includes(addon.id));
    };

    const renderSelectionScreen = () => (
        <div>
            <header className="text-center mb-10">
                <h1 className="text-4xl font-bold tracking-tight text-slate-900">Choose Your Package</h1>
                <p className="mt-2 text-lg text-slate-600">Start with a base package and customize it to your needs.</p>
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
                         Change Package
                     </button>
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Customize Your Package</h1>
                    <p className="mt-2 text-lg text-slate-600">You've selected the <span className="font-bold text-indigo-600">{selectedPackage.name}</span>. Add or remove items below.</p>
                </header>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 lg:gap-8">
                    {/* Left side: Configuration */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Package Items */}
                        <section>
                            <h2 className="text-xl font-semibold text-slate-800 mb-4">Included in Your Package</h2>
                             <div className="space-y-3">
                                {selectedPackage.included.map(item => (
                                    <CustomizationListItem key={item.id} item={item} isSelected={customizedItems.includes(item.id)} onToggle={handleItemToggle} />
                                ))}
                            </div>
                        </section>
                        
                        {/* Available Add-ons */}
                        {availableAddons.length > 0 && (
                            <section>
                                <h2 className="text-xl font-semibold text-slate-800 mb-4">Available Add-ons</h2>
                                <div className="space-y-3">
                                    {availableAddons.map(addon => (
                                         <CustomizationListItem key={addon.id} item={addon} isSelected={customizedItems.includes(addon.id)} onToggle={handleItemToggle} />
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                     {/* Right side: Summary */}
                    <div className="lg:col-span-1 mt-8 lg:mt-0">
                        <div className="sticky top-8 bg-white rounded-2xl shadow-lg p-6 lg:p-8">
                            <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Your Custom Quote</h3>
                            <p className="text-center text-sm text-slate-500 mb-6">Based on the <span className="font-semibold">{selectedPackage.name}</span></p>
                            
                            <div className="mt-6 border-t border-slate-200 pt-6">
                                <div className="flex justify-between items-center text-2xl font-bold">
                                    <span className="text-slate-900">Total</span>
                                    <span className="text-indigo-600">${totalPrice.toLocaleString()}</span>
                                </div>
                            </div>
                             
                            <div className="mt-6 space-y-3">
                                <button className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-transform hover:scale-105">
                                    Proceed to Booking
                                </button>
                                <button className="w-full bg-slate-100 text-slate-700 font-bold py-3 px-4 rounded-lg hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition">
                                    Save as Draft
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
       );
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                {currentStep === 'selection' ? renderSelectionScreen() : renderCustomizationScreen()}
            </div>
        </div>
    );
};
