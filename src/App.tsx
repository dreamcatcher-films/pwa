

import React, { useState, useCallback } from 'react';
import HomePage from './pages/HomePage.tsx';
import CalculatorPage from './pages/CalculatorPage.tsx';
import Header from './components/Header.tsx';
import SideMenu from './components/SideMenu.tsx';
import LoginPage from './pages/LoginPage.tsx';
import ClientPanelPage from './pages/ClientPanelPage.tsx';
import AdminLoginPage from './pages/AdminLoginPage.tsx';
import AdminDashboardPage from './pages/AdminDashboardPage.tsx';
import AdminBookingDetailsPage from './pages/AdminBookingDetailsPage.tsx';
import GalleryPage from './pages/GalleryPage.tsx';
import InstallPrompt from './components/InstallPrompt.tsx';
import ContactPage from './pages/ContactPage.tsx';
import Footer from './components/Footer.tsx';

export type Page = 
  'home' | 'calculator' | 'gallery' | 'contact' |
  'login' | 'clientPanel' | 
  'adminLogin' | 'adminDashboard' | 'adminBookingDetails' |
  'adminAccessKeys' | 'adminAvailability' | 'adminGallery' | 'adminPackages' | 'adminDiscounts' | 'adminStages' | 'adminSettings' | 'adminHomepage' | 'adminInstagram' | 'adminInbox';

const App = () => {
    const [currentPage, setCurrentPage] = useState<Page>('home');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [viewingBookingId, setViewingBookingId] = useState<number | null>(null);

    const navigateTo = useCallback((page: Page) => {
        setCurrentPage(page);
        setIsMenuOpen(false);
        if (page !== 'adminBookingDetails') {
            setViewingBookingId(null);
        }
    }, []);

    const handleViewBookingDetails = useCallback((bookingId: number) => {
        setViewingBookingId(bookingId);
        navigateTo('adminBookingDetails');
    }, [navigateTo]);

    const renderCurrentPage = () => {
        switch (currentPage) {
            case 'home':
                return <HomePage navigateTo={navigateTo} />;
            case 'calculator':
                return <CalculatorPage navigateTo={navigateTo} />;
            case 'gallery':
                return <GalleryPage />;
            case 'contact':
                return <ContactPage />;
            case 'login':
                return <LoginPage navigateTo={navigateTo} />;
            case 'clientPanel':
                return <ClientPanelPage navigateTo={navigateTo} />;
            case 'adminLogin':
                return <AdminLoginPage navigateTo={navigateTo} />;
            case 'adminDashboard':
                return <AdminDashboardPage navigateTo={navigateTo} onViewDetails={handleViewBookingDetails} currentPage='bookings' />;
             case 'adminAccessKeys':
                return <AdminDashboardPage navigateTo={navigateTo} onViewDetails={handleViewBookingDetails} currentPage='accessKeys' />;
             case 'adminAvailability':
                return <AdminDashboardPage navigateTo={navigateTo} onViewDetails={handleViewBookingDetails} currentPage='availability' />;
            case 'adminGallery':
                return <AdminDashboardPage navigateTo={navigateTo} onViewDetails={handleViewBookingDetails} currentPage='gallery' />;
            case 'adminPackages':
                return <AdminDashboardPage navigateTo={navigateTo} onViewDetails={handleViewBookingDetails} currentPage='packages' />;
            case 'adminDiscounts':
                return <AdminDashboardPage navigateTo={navigateTo} onViewDetails={handleViewBookingDetails} currentPage='discounts' />;
            case 'adminStages':
                return <AdminDashboardPage navigateTo={navigateTo} onViewDetails={handleViewBookingDetails} currentPage='stages' />;
            case 'adminSettings':
                return <AdminDashboardPage navigateTo={navigateTo} onViewDetails={handleViewBookingDetails} currentPage='settings' />;
            case 'adminHomepage':
                return <AdminDashboardPage navigateTo={navigateTo} onViewDetails={handleViewBookingDetails} currentPage='homepage' />;
            case 'adminInbox':
                return <AdminDashboardPage navigateTo={navigateTo} onViewDetails={handleViewBookingDetails} currentPage='inbox' />;
            case 'adminBookingDetails':
                 return viewingBookingId 
                    ? <AdminBookingDetailsPage navigateTo={navigateTo} bookingId={viewingBookingId} /> 
                    : <AdminDashboardPage navigateTo={navigateTo} onViewDetails={handleViewBookingDetails} currentPage='bookings' />;
            default:
                return <HomePage navigateTo={navigateTo} />;
        }
    };
    
    const hasAppContainer = currentPage === 'clientPanel' || currentPage === 'adminLogin' || currentPage === 'login';
    const isPublicPage = ['home', 'calculator', 'gallery', 'contact'].includes(currentPage);

    return (
        <div className="relative min-h-screen font-sans">
            <div className="flex flex-col min-h-screen">
                <Header
                    onMenuToggle={() => setIsMenuOpen(!isMenuOpen)}
                    onViewDetails={handleViewBookingDetails}
                    navigateTo={navigateTo}
                />
                <main className={`flex-grow ${isPublicPage ? 'pb-64' : ''}`}>
                    <div className={hasAppContainer ? 'max-w-7xl mx-auto p-4 sm:p-6 lg:p-8' : ''}>
                        {renderCurrentPage()}
                    </div>
                </main>
                {isPublicPage && <Footer />}
                <InstallPrompt />
            </div>
            <SideMenu isOpen={isMenuOpen} onNavigate={navigateTo} onClose={() => setIsMenuOpen(false)} />
        </div>
    );
};

export default App;
