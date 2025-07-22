import React, { useEffect, FC, ReactNode, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { InboxStackIcon, KeyIcon, CalendarIcon, PhotoIcon, TagIcon, TicketIcon, ClipboardDocumentListIcon, CircleStackIcon, HomeModernIcon, EnvelopeIcon, MenuIcon, XMarkIcon } from '../components/Icons.tsx';

// --- TYPES ---
interface NavItem {
    path: string;
    label: string;
    icon: ReactNode;
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
            { path: 'klucze-dostepu', label: 'Klucze Dostępu', icon: <KeyIcon className="w-5 h-5" />, subtitle: 'Generuj klucze dostępu dla nowych klientów.' },
        ]
    },
    {
        title: 'Zarządzanie Treścią i Ofertą',
        items: [
            { path: 'strona-glowna', label: 'Strona Główna', icon: <HomeModernIcon className="w-5 h-5" />, subtitle: 'Edytuj karuzelę, sekcję "O nas" i opinie.' },
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
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    
    useEffect(() => {
        const token = localStorage.getItem('adminAuthToken');
        if (!token) {
            navigate('/admin/logowanie');
        }
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('adminAuthToken');
        navigate('/');
    };

    const currentNavItem = navConfig
        .flatMap(g => g.items)
        .find(item => location.pathname.startsWith(`/admin/${item.path}`));

    return (
        <div className="flex" style={{ minHeight: 'calc(100vh - 64px)' }}>
            {/* Overlay for mobile */}
            {isSidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                ></div>
            )}

            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-20 w-72 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-4 flex justify-between items-center md:hidden border-b border-slate-200">
                    <h2 className="font-bold text-lg text-slate-800">Menu</h2>
                    <button onClick={() => setIsSidebarOpen(false)} className="p-2">
                        <XMarkIcon className="w-6 h-6"/>
                    </button>
                </div>
                <nav className="p-4 flex-grow">
                    {navConfig.map(group => (
                        <div key={group.title} className="mb-6">
                            <h3 className="px-3 mb-2 text-xs font-bold uppercase text-slate-400 tracking-wider">{group.title}</h3>
                            <ul className="space-y-1">
                                {group.items.map(item => (
                                    <SidebarNavItem 
                                        key={item.path}
                                        item={item}
                                        onClick={() => setIsSidebarOpen(false)}
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
                        <div className="flex items-center gap-4">
                             <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-md md:hidden">
                                <MenuIcon className="w-6 h-6" />
                            </button>
                            <div>
                                <h1 className="text-3xl font-bold tracking-tight text-slate-900">{currentNavItem?.label || 'Panel Administratora'}</h1>
                                <p className="mt-1 text-slate-600">{currentNavItem?.subtitle || 'Zarządzaj rezerwacjami, klientami i ustawieniami aplikacji.'}</p>
                            </div>
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
        </div>
    );
};

export default AdminDashboardPage;
