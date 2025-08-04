

import React, { useEffect, FC, ReactElement, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { InboxStackIcon, KeyIcon, CalendarIcon, PhotoIcon, TagIcon, TicketIcon, ClipboardDocumentListIcon, CircleStackIcon, HomeModernIcon, EnvelopeIcon, MenuIcon, XMarkIcon, FilmIcon, UserGroupIcon, QuestionMarkCircleIcon, Squares2X2Icon } from '../components/Icons.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';

// --- TYPES ---
interface NavItem {
    path: string;
    label: string;
    icon: ReactElement;
    subtitle: string;
}

interface NavGroup {
    title: string;
    items: NavItem[];
}

// --- NAVIGATION CONFIG ---
const navConfig: NavGroup[] = [
    {
        title: 'Zarządzanie Klientami',
        items: [
            { path: 'inbox', label: 'Skrzynka odbiorcza', icon: <EnvelopeIcon className="w-5 h-5" />, subtitle: 'Zarządzaj zapytaniami z formularza kontaktowego.' },
            { path: 'rezerwacje', label: 'Rezerwacje', icon: <InboxStackIcon className="w-5 h-5" />, subtitle: 'Przeglądaj i zarządzaj wszystkimi rezerwacjami.' },
            { path: 'goscie', label: 'Listy Gości', icon: <UserGroupIcon className="w-5 h-5" />, subtitle: 'Zarządzaj listami gości dla każdej pary.' },
            { path: 'klucze-dostepu', label: 'Klucze Dostępu', icon: <KeyIcon className="w-5 h-5" />, subtitle: 'Generuj klucze dostępu dla nowych klientów.' },
        ]
    },
    {
        title: 'Zarządzanie Treścią i Ofertą',
        items: [
            { path: 'strona-glowna', label: 'Strona Główna', icon: <HomeModernIcon className="w-5 h-5" />, subtitle: 'Edytuj karuzelę, sekcję "O nas" i opinie.' },
            { path: 'filmy', label: 'Filmy', icon: <FilmIcon className="w-5 h-5" />, subtitle: 'Zarządzaj realizacjami wideo z YouTube.' },
            { path: 'galeria', label: 'Galeria', icon: <PhotoIcon className="w-5 h-5" />, subtitle: 'Zarządzaj publiczną galerią realizacji.' },
            { path: 'oferta', label: 'Oferta', icon: <TagIcon className="w-5 h-5" />, subtitle: 'Konfiguruj pakiety i dostępne dodatki.' },
            { path: 'kody-rabatowe', label: 'Kody Rabatowe', icon: <TicketIcon className="w-5 h-5" />, subtitle: 'Twórz i zarządzaj kodami rabatowymi.' },
        ]
    },
    {
        title: 'Konfiguracja Systemu',
        items: [
            { path: 'dostepnosc', label: 'Dostępność', icon: <CalendarIcon className="w-5 h-5" />, subtitle: 'Zarządzaj swoim kalendarzem i terminami.' },
            { path: 'etapy-produkcji', label: 'Etapy Produkcji', icon: <ClipboardDocumentListIcon className="w-5 h-5" />, subtitle: 'Definiuj szablony etapów produkcji dla klientów.' },
            { path: 'ankiety', label: 'Ankiety', icon: <QuestionMarkCircleIcon className="w-5 h-5" />, subtitle: 'Zarządzaj szablonami ankiet i pytaniami.' },
            { path: 'ustawienia', label: 'Ustawienia', icon: <CircleStackIcon className="w-5 h-5" />, subtitle: 'Zarządzaj ustawieniami aplikacji i bazą danych.' },
        ]
    }
];

// --- SIDEBAR COMPONENTS ---
const SidebarNavItem: FC<{ item: NavItem, onClick: () => void }> = ({ item, onClick }) => (
    <li>
        <NavLink
            to={item.path}
            onClick={onClick}
            end={item.path === 'rezerwacje' ? false : true} // Allow matching for /rezerwacje/:id
            className={({ isActive }) =>
                `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                isActive 
                ? 'bg-indigo-50 text-indigo-700' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
        >
            {item.icon}
            <span>{item.label}</span>
        </NavLink>
    </li>
);

// --- MAIN COMPONENT ---
const AdminDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const { isAdmin, logout } = useAuth();
    
    useEffect(() => {
        if (!isAdmin) {
            navigate('/admin/logowanie', { replace: true });
        }
    }, [isAdmin, navigate]);

    const handleLogout = () => {
        logout();
    };

    const currentNavItem = navConfig
        .flatMap(g => g.items)
        .find(item => location.pathname.startsWith(`/admin/${item.path}`));

    if (!isAdmin) {
        return null; // Render nothing while redirecting
    }

    return (
        <div className="flex" style={{ minHeight: 'calc(100vh - 64px)' }}>
            {/* Sidebar */}
            <aside className="fixed inset-y-0 left-0 z-10 w-72 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col transform -translate-x-full transition-transform duration-300 ease-in-out md:static md:translate-x-0">
                <nav className="p-4 flex-grow">
                    {navConfig.map(group => (
                        <div key={group.title} className="mb-6">
                            <h3 className="px-3 mb-2 text-xs font-bold uppercase text-slate-400 tracking-wider">{group.title}</h3>
                            <ul className="space-y-1">
                                {group.items.map(item => (
                                    <SidebarNavItem 
                                        key={item.path}
                                        item={item}
                                        onClick={() => {}}
                                    />
                                ))}
                            </ul>
                        </div>
                    ))}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 bg-slate-50 overflow-y-auto">
                 <div className="p-6 sm:p-8 lg:p-10">
                    <header className="flex flex-col sm:flex-row justify-between items-start mb-8">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{currentNavItem?.label || 'Panel Administratora'}</h1>
                            <p className="mt-1 text-slate-600">{currentNavItem?.subtitle || 'Zarządzaj rezerwacjami, klientami i ustawieniami aplikacji.'}</p>
                        </div>
                        <button 
                            onClick={handleLogout}
                            className="mt-4 sm:mt-0 bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300 transition flex-shrink-0"
                        >
                            Wyloguj się
                        </button>
                    </header>
                    <Outlet />
                </div>
            </main>

            {/* Mobile FAB Menu */}
            <div className="md:hidden fixed bottom-6 right-6 z-40">
                <button
                    onClick={() => setIsMobileNavOpen(true)}
                    className="bg-brand-dark-green text-white rounded-full p-4 shadow-lg hover:bg-opacity-90 transition-transform hover:scale-110"
                    aria-label="Otwórz menu nawigacji"
                >
                    <Squares2X2Icon className="w-8 h-8"/>
                </button>
            </div>

            {/* Mobile Menu Panel */}
            {isMobileNavOpen && (
                <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex flex-col justify-end" onClick={() => setIsMobileNavOpen(false)}>
                    <div className="bg-white rounded-t-2xl shadow-2xl p-4 animate-slide-in-bottom max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4"></div>
                        {navConfig.map(group => (
                            <div key={group.title} className="mb-4">
                                <h3 className="px-3 mb-2 text-xs font-bold uppercase text-slate-400 tracking-wider">{group.title}</h3>
                                <nav className="space-y-1">
                                    {group.items.map(item => (
                                        <NavLink
                                            key={item.path}
                                            to={item.path}
                                            onClick={() => setIsMobileNavOpen(false)}
                                            end={item.path === 'rezerwacje' ? false : true}
                                            className={({ isActive }) => `w-full flex items-center gap-3 p-3 rounded-lg text-left font-semibold ${isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-700 hover:bg-slate-100'}`}
                                        >
                                            {React.cloneElement(item.icon, { className: "w-6 h-6" })}
                                            <span>{item.label}</span>
                                        </NavLink>
                                    ))}
                                </nav>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboardPage;
