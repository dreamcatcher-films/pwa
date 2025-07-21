

import React, { useEffect, FC, ReactNode } from 'react';
import { Page } from '../App.tsx';
import { LoadingSpinner, InboxStackIcon, KeyIcon, CalendarIcon, PhotoIcon, TagIcon, TicketIcon, ClipboardDocumentListIcon, CircleStackIcon, HomeModernIcon, EnvelopeIcon } from '../components/Icons.tsx';
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

// --- SHARED TYPES ---
export type AdminTab = 'inbox' | 'bookings' | 'accessKeys' | 'availability' | 'gallery' | 'packages' | 'discounts' | 'stages' | 'settings' | 'homepage';

interface AdminDashboardPageProps {
    navigateTo: (page: Page) => void;
    onViewDetails: (bookingId: number) => void;
    currentPage: AdminTab;
}

// --- MAIN COMPONENT ---
const TabButton: FC<{ isActive: boolean; onClick: () => void; children: ReactNode }> = ({ isActive, onClick, children }) => (
    <button onClick={onClick} className={`flex items-center gap-2 ${isActive ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-3 border-b-2 font-medium text-sm transition-colors focus:outline-none`}>
        {children}
    </button>
);

const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ navigateTo, onViewDetails, currentPage }) => {
    
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
            case 'inbox':
                return <AdminInboxPage />;
            case 'bookings':
                return <AdminBookingsPage onViewDetails={onViewDetails} />;
            case 'accessKeys':
                return <AdminAccessKeysPage />;
            case 'availability':
                return <AdminAvailabilityPage onViewBookingDetails={onViewDetails} />;
            case 'gallery':
                return <AdminGalleryPage />;
            case 'packages':
                return <AdminPackagesPage />;
            case 'discounts':
                return <AdminDiscountsPage />;
            case 'stages':
                return <AdminStagesPage />;
            case 'settings':
                return <AdminSettingsPage />;
            case 'homepage':
                return <AdminHomepagePage />;
            default:
                return <AdminInboxPage />;
        }
    }

    return (
        <div className="max-w-7xl mx-auto">
            <header className="flex flex-col sm:flex-row justify-between items-center mb-6">
                <div className="text-center sm:text-left">
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900">Panel Administratora</h1>
                    <p className="mt-2 text-lg text-slate-600">Zarządzaj rezerwacjami, klientami i ustawieniami aplikacji.</p>
                </div>
                <button 
                    onClick={handleLogout}
                    className="mt-4 sm:mt-0 bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300 transition"
                >
                    Wyloguj się
                </button>
            </header>

            <div className="border-b border-slate-200 mb-8">
                <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
                    <TabButton isActive={currentPage === 'inbox'} onClick={() => navigateTo('adminInbox')}>
                        <EnvelopeIcon className="w-5 h-5" /> Skrzynka odbiorcza
                    </TabButton>
                    <TabButton isActive={currentPage === 'bookings'} onClick={() => navigateTo('adminDashboard')}>
                        <InboxStackIcon className="w-5 h-5" /> Rezerwacje
                    </TabButton>
                     <TabButton isActive={currentPage === 'homepage'} onClick={() => navigateTo('adminHomepage')}>
                        <HomeModernIcon className="w-5 h-5" /> Strona Główna
                    </TabButton>
                    <TabButton isActive={currentPage === 'accessKeys'} onClick={() => navigateTo('adminAccessKeys')}>
                        <KeyIcon className="w-5 h-5" /> Klucze Dostępu
                    </TabButton>
                    <TabButton isActive={currentPage === 'availability'} onClick={() => navigateTo('adminAvailability')}>
                        <CalendarIcon className="w-5 h-5" /> Dostępność
                    </TabButton>
                    <TabButton isActive={currentPage === 'gallery'} onClick={() => navigateTo('adminGallery')}>
                        <PhotoIcon className="w-5 h-5" /> Galeria
                    </TabButton>
                    <TabButton isActive={currentPage === 'packages'} onClick={() => navigateTo('adminPackages')}>
                        <TagIcon className="w-5 h-5" /> Oferta
                    </TabButton>
                    <TabButton isActive={currentPage === 'discounts'} onClick={() => navigateTo('adminDiscounts')}>
                        <TicketIcon className="w-5 h-5" /> Kody Rabatowe
                    </TabButton>
                    <TabButton isActive={currentPage === 'stages'} onClick={() => navigateTo('adminStages')}>
                        <ClipboardDocumentListIcon className="w-5 h-5" /> Etapy Produkcji
                    </TabButton>
                     <TabButton isActive={currentPage === 'settings'} onClick={() => navigateTo('adminSettings')}>
                        <CircleStackIcon className="w-5 h-5" /> Ustawienia
                    </TabButton>
                </nav>
            </div>

            <div>
                {renderContent()}
            </div>
        </div>
    );
};

export default AdminDashboardPage;
