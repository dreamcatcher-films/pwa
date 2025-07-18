import React from 'react';
import { Page } from '../App.tsx';
import { XMarkIcon } from './Icons.tsx';

interface SideMenuProps {
    isOpen: boolean;
    onNavigate: (page: Page) => void;
    onClose: () => void;
}

const SideMenu: React.FC<SideMenuProps> = ({ isOpen, onNavigate, onClose }) => {
    return (
        <>
            {/* Overlay */}
            <div 
                className={`fixed inset-0 bg-black z-40 transition-opacity duration-300 ${isOpen ? 'bg-opacity-50' : 'bg-opacity-0 pointer-events-none'}`}
                onClick={onClose}
                aria-hidden="true"
            ></div>

            {/* Side Menu */}
            <div 
                className={`fixed top-0 left-0 h-full bg-white w-72 shadow-xl z-50 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
                role="dialog"
                aria-modal="true"
            >
                <div className="p-4 flex justify-between items-center border-b">
                    <h2 className="text-lg font-bold text-slate-800">Menu</h2>
                    <button onClick={onClose} className="p-2 rounded-md text-slate-500 hover:bg-slate-100" aria-label="Zamknij menu">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                <nav className="p-4">
                    <ul>
                        <li>
                            <a 
                                href="#"
                                onClick={(e) => { e.preventDefault(); onNavigate('home'); }}
                                className="block py-3 px-4 rounded-lg text-slate-700 font-semibold hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                            >
                                Strona Główna
                            </a>
                        </li>
                        <li>
                            <a 
                                href="#"
                                onClick={(e) => { e.preventDefault(); onNavigate('calculator'); }}
                                className="block py-3 px-4 rounded-lg text-slate-700 font-semibold hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                            >
                                Kalkulator Usług
                            </a>
                        </li>
                         <li>
                            <a 
                                href="#"
                                onClick={(e) => { e.preventDefault(); onNavigate('login'); }}
                                className="block py-3 px-4 rounded-lg text-slate-700 font-semibold hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                            >
                                Panel Klienta
                            </a>
                        </li>
                    </ul>
                </nav>
            </div>
        </>
    );
};

export default SideMenu;
