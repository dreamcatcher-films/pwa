
import React, { useEffect, FC, ReactNode, useState } from 'react';
import { Page } from '../App.tsx';
import { InboxStackIcon, KeyIcon, CalendarIcon, PhotoIcon, TagIcon, TicketIcon, ClipboardDocumentListIcon, CircleStackIcon, HomeModernIcon, EnvelopeIcon, MenuIcon, XMarkIcon } from '../components/Icons.tsx';
import AdminBookingsPage from './AdminBookingsPage.tsx';
import AdminAccessKeysPage from './AdminAccessKeysPage.tsx';
import AdminAvailabilityPage from './AdminAvailabilityPage.tsx';
import AdminGalleryPage from './AdminGalleryPage.tsx';
import AdminPackagesPage from './AdminPackagesPage.tsx';
import AdminDiscountsPage from './AdminDiscountsPage.tsx';
import AdminStagesPage from './AdminStagesPage.tsx';
import AdminSettingsPage from './AdminSettingsPage.tsx';
import AdminHomepagePage from './AdminHomepagePage.tsx';
import AdminInboxPage from './AdminInboxPage.tsx';

// --- TYPES ---
export type AdminTab = 'inbox' | 'bookings' | 'accessKeys' | 'availability' | 'gallery' | 'packages' | 'discounts' | 'stages' | 'settings' | 'homepage';

interface AdminDashboardPageProps {
    navigateTo: (page: Page) => void;
    onViewDetails: (bookingId: number) => void;
    currentPage: AdminTab;
}

interface NavItem {
    page: Page;
    tab: AdminTab;
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
            { page: 'adminInbox', tab: 'inbox', label: 'Skrzynka odbiorcza', icon: <EnvelopeIcon className="w-5 h-5" />, subtitle: 'Zarządzaj zapytaniami z formularza kontaktowego.' },
            { page: 'adminDashboard', tab: 'bookings', label: 'Rezerwacje', icon: <InboxStackIcon className="w-5 h-5" />, subtitle: 'Przeglądaj i zarządzaj wszystkimi rezerwacjami.' },
            { page: 'adminAccessKeys', tab: 'accessKeys', label: 'Klucze Dostępu', icon: <KeyIcon className="w-5 h-5" />, subtitle: 'Generuj klucze dostępu dla nowych klientów.' },
        ]
    },
    {
        title: 'Zarządzanie Treścią i Ofertą',
        items: [
            { page: 'adminHomepage', tab: 'homepage', label: 'Strona Główna', icon: <HomeModernIcon className="w-5 h-5" />, subtitle: 'Edytuj karuzelę, sekcję "O nas" i opinie.' },
            { page: 'adminGallery', tab: 'gallery', label: 'Galeria', icon: <PhotoIcon className="w-5 h-5" />, subtitle: 'Zarządzaj publiczną galerią realizacji.' },
            { page: 'adminPackages', tab: 'packages', label: 'Oferta', icon: <TagIcon className="w-5 h-5" />, subtitle: 'Konfiguruj pakiety i dostępne dodatki.' },
            { page: 'adminDiscounts', tab: 'discounts', label: 'Kody Rabatowe', icon: <TicketIcon className="w-5 h-5" />, subtitle: 'Twórz i zarządzaj kodami rabatowymi.' },
        ]
    },
    {
        title: 'Konfiguracja Systemu',
        items: [
            { page: 'adminAvailability', tab: 'availability', label: 'Dostępność', icon: <CalendarIcon className="w-5 h-5" />, subtitle: 'Zarządzaj swoim kalendarzem i terminami.' },
            { page: 'adminStages', tab: 'stages', label: 'Etapy Produkcji', icon: <ClipboardDocumentListIcon className="w-5 h-5" />, subtitle: 'Definiuj szablony etapów produkcji dla klientów.' },
            { page: 'adminSettings', tab: 'settings', label: 'Ustawienia', icon: <CircleStackIcon className="w-5 h-5" />, subtitle: 'Zarządzaj ustawieniami aplikacji i bazą danych.' },
        ]
    }
];

// --- SIDEBAR COMPONENTS ---
const SidebarNavItem: FC<{ item: NavItem, isActive: boolean, onClick: () => void }> = ({ item, isActive, onClick }) => (
    <li>
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                isActive 
                ? 'bg-indigo-50 text-indigo-700' 
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
        >
            {item.icon}
            <span>{item.label}</span>
        </button>
    </li>
);

// --- MAIN COMPONENT ---
const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ navigateTo, onViewDetails, currentPage }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    
    useEffect(() => {
        const token = localStorage.getItem('adminAuthToken');
        if (!token) {
            navigateTo('adminLogin');
            return;
        }
    }, [navigateTo]);

    const handleLogout = () => {
        localStorage.removeItem('adminAuthToken');
        navigateTo('home');
    };

    const renderContent = () => {
        switch (currentPage) {
            case 'inbox': return <AdminInboxPage />;
            case 'bookings': return <AdminBookingsPage onViewDetails={onViewDetails} />;
            case 'accessKeys': return <AdminAccessKeysPage />;
            case 'availability': return <AdminAvailabilityPage onViewBookingDetails={onViewDetails} />;
            case 'gallery': return <AdminGalleryPage />;
            case 'packages': return <AdminPackagesPage />;
            case 'discounts': return <AdminDiscountsPage />;
            case 'stages': return <AdminStagesPage />;
            case 'settings': return <AdminSettingsPage />;
            case 'homepage': return <AdminHomepagePage />;
            default: return <AdminInboxPage />;
        }
    };

    const currentNavItem = navConfig.flatMap(g => g.items).find(item => item.tab === currentPage);

    return (
        <div className="flex relative" style={{ minHeight: 'calc(100vh - 64px)' }}>
            {/* Overlay for mobile */}
            {isSidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                ></div>
            )}

            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
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
                                        key={item.page}
                                        item={item}
                                        isActive={currentPage === item.tab}
                                        onClick={() => {
                                            navigateTo(item.page);
                                            setIsSidebarOpen(false);
                                        }}
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

                    <div className="max-w-7xl mx-auto">
                        {renderContent()}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminDashboardPage;
