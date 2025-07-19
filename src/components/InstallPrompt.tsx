import React, { useState, useEffect } from 'react';
import { XMarkIcon, ShareIcon } from './Icons.tsx';

const InstallPrompt: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const isIos = () => {
            const userAgent = window.navigator.userAgent.toLowerCase();
            return /iphone|ipad|ipod/.test(userAgent);
        };
        
        // This is a non-standard property, but it's the only way to detect PWA mode on iOS.
        const isInStandaloneMode = () => ('standalone' in window.navigator) && ((window.navigator as any).standalone);

        // Check if the prompt should be shown.
        const userHasClosedPrompt = localStorage.getItem('hasClosedIosInstallPrompt');

        if (isIos() && !isInStandaloneMode() && !userHasClosedPrompt) {
            setIsVisible(true);
        }
    }, []);

    const handleClose = () => {
        setIsVisible(false);
        localStorage.setItem('hasClosedIosInstallPrompt', 'true');
    };

    if (!isVisible) {
        return null;
    }

    return (
        <div className="fixed bottom-4 left-4 right-4 bg-slate-800 text-white p-4 shadow-lg z-50 rounded-xl animate-slide-in-bottom md:max-w-md md:left-auto">
            <div className="flex items-center justify-between gap-4">
                <div className="flex-grow">
                    <p className="font-bold">Zainstaluj aplikację!</p>
                    <p className="text-sm text-slate-300">
                        Dodaj aplikację do ekranu głównego, aby mieć szybki dostęp. Kliknij <ShareIcon className="w-4 h-4 inline-block mx-1" /> a następnie "Dodaj do ekranu początkowego".
                    </p>
                </div>
                <button 
                    onClick={handleClose} 
                    className="p-2 rounded-full text-slate-300 hover:bg-slate-700 self-start"
                    aria-label="Zamknij"
                >
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

export default InstallPrompt;
