import React, { useState, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage.tsx';
import CalculatorPage from './pages/CalculatorPage.tsx';
import Header from './components/Header.tsx';
import SideMenu from './components/SideMenu.tsx';
import LoginPage from './pages/LoginPage.tsx';
import ClientPanelPage from './pages/ClientPanelPage.tsx';
import GalleryPage from './pages/GalleryPage.tsx';
import InstallPrompt from './components/InstallPrompt.tsx';
import ContactPage from './pages/ContactPage.tsx';
import Footer from './components/Footer.tsx';
import { EngagementRingSpinner } from './components/Icons.tsx';

// Lazy-load admin components for code-splitting to improve initial load performance.
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage.tsx'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage.tsx'));
const AdminBookingsPage = lazy(() => import('./pages/AdminBookingsPage.tsx'));
const AdminAccessKeysPage = lazy(() => import('./pages/AdminAccessKeysPage.tsx'));
const AdminAvailabilityPage = lazy(() => import('./pages/AdminAvailabilityPage.tsx'));
const AdminGalleryPage = lazy(() => import('./pages/AdminGalleryPage.tsx'));
const AdminPackagesPage = lazy(() => import('./pages/AdminPackagesPage.tsx'));
const AdminDiscountsPage = lazy(() => import('./pages/AdminDiscountsPage.tsx'));
const AdminStagesPage = lazy(() => import('./pages/AdminStagesPage.tsx'));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage.tsx'));
const AdminHomepagePage = lazy(() => import('./pages/AdminHomepagePage.tsx'));
const AdminInboxPage = lazy(() => import('./pages/AdminInboxPage.tsx'));
const AdminBookingDetailsPage = lazy(() => import('./pages/AdminBookingDetailsPage.tsx'));

const App = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const location = useLocation();

    const publicPaths = ['/', '/kalkulator', '/galeria', '/kontakt'];
    const isPublicPage = publicPaths.includes(location.pathname);

    return (
        <>
            <div className="flex flex-col min-h-screen">
                <Header onMenuToggle={() => setIsMenuOpen(!isMenuOpen)} />
                <main className="flex-grow">
                    <Suspense fallback={<div className="flex justify-center items-center h-screen"><EngagementRingSpinner /></div>}>
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
                    </Suspense>
                </main>
                {isPublicPage && <Footer />}
                <InstallPrompt />
            </div>
            <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
        </>
    );
};

export default App;
