import React, { useState } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage.tsx';
import CalculatorPage from './pages/CalculatorPage.tsx';
import Header from './components/Header.tsx';
import SideMenu from './components/SideMenu.tsx';
import LoginPage from './pages/LoginPage.tsx';
import ClientPanelPage from './pages/ClientPanelPage.tsx';
import AdminLoginPage from './pages/AdminLoginPage.tsx';
import AdminDashboardPage from './pages/AdminDashboardPage.tsx';
import GalleryPage from './pages/GalleryPage.tsx';
import InstallPrompt from './components/InstallPrompt.tsx';
import ContactPage from './pages/ContactPage.tsx';
import Footer from './components/Footer.tsx';
import AdminBookingsPage from './pages/AdminBookingsPage.tsx';
import AdminAccessKeysPage from './pages/AdminAccessKeysPage.tsx';
import AdminAvailabilityPage from './pages/AdminAvailabilityPage.tsx';
import AdminGalleryPage from './pages/AdminGalleryPage.tsx';
import AdminPackagesPage from './pages/AdminPackagesPage.tsx';
import AdminDiscountsPage from './pages/AdminDiscountsPage.tsx';
import AdminStagesPage from './pages/AdminStagesPage.tsx';
import AdminSettingsPage from './pages/AdminSettingsPage.tsx';
import AdminHomepagePage from './pages/AdminHomepagePage.tsx';
import AdminInboxPage from './pages/AdminInboxPage.tsx';
import AdminBookingDetailsPage from './pages/AdminBookingDetailsPage.tsx';

const App = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const location = useLocation();

    const publicPaths = ['/', '/kalkulator', '/galeria', '/kontakt'];
    const isPublicPage = publicPaths.includes(location.pathname);

    return (
        <div className="flex flex-col min-h-screen">
            <Header onMenuToggle={() => setIsMenuOpen(!isMenuOpen)} />
            <main className="flex-grow">
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/kalkulator" element={<CalculatorPage />} />
                    <Route path="/galeria" element={<GalleryPage />} />
                    <Route path="/kontakt" element={<ContactPage />} />
                    <Route path="/logowanie" element={<LoginPage />} />
                    <Route path="/panel-klienta" element={<ClientPanelPage />} />
                    <Route path="/admin/logowanie" element={<AdminLoginPage />} />
                    
                    <Route path="/admin" element={<AdminDashboardPage />}>
                        <Route index element={<Navigate to="/admin/inbox" replace />} />
                        <Route path="inbox" element={<AdminInboxPage />} />
                        <Route path="rezerwacje" element={<AdminBookingsPage />} />
                        <Route path="rezerwacje/:bookingId" element={<AdminBookingDetailsPage />} />
                        <Route path="klucze-dostepu" element={<AdminAccessKeysPage />} />
                        <Route path="dostepnosc" element={<AdminAvailabilityPage />} />
                        <Route path="galeria" element={<AdminGalleryPage />} />
                        <Route path="oferta" element={<AdminPackagesPage />} />
                        <Route path="kody-rabatowe" element={<AdminDiscountsPage />} />
                        <Route path="etapy-produkcji" element={<AdminStagesPage />} />
                        <Route path="ustawienia" element={<AdminSettingsPage />} />
                        <Route path="strona-glowna" element={<AdminHomepagePage />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
            {isPublicPage && <Footer />}
            <InstallPrompt />
            <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
        </div>
    );
};

export default App;
