import React from 'react';
import { MenuIcon } from './Icons';

interface HeaderProps {
    onMenuToggle: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuToggle }) => {
    return (
        <header className="bg-white shadow-md sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <button
                            onClick={onMenuToggle}
                            className="p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                            aria-label="Otwórz menu"
                        >
                            <MenuIcon className="h-6 w-6" />
                        </button>
                    </div>
                    <div className="text-xl font-bold text-slate-800">
                        Dreamcatcher Films
                    </div>
                    <div className="w-8"></div>
                </div>
            </div>
        </header>
    );
};

export default Header;
