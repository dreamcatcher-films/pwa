

import React, { useState, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage.tsx';
import { CalculatorPage } from './pages/CalculatorPage.tsx';
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
const FilmsPage = lazy(() => import('./pages/FilmsPage.tsx'));
const AdminFilmsPage = lazy(() => import('./pages/AdminFilmsPage.tsx'));
const RsvpPage = lazy(() => import('./pages/RsvpPage.tsx'));
const AdminGuestsPage = lazy(() => import('./pages/AdminGuestsPage.tsx'));
const AdminQuestionnairesPage = lazy(() => import('./pages/AdminQuestionnairesPage.tsx'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage.tsx'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.tsx'));

const App = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const location = useLocation();

    const publicPaths = ['/', '/kalkulator', '/galeria', '/kontakt', '/filmy', '/przypomnij-haslo', '/reset-hasla'];
    const isPublicPage = publicPaths.some(path => location.pathname.startsWith(path)) || location.pathname.startsWith('/rsvp/');


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
                            <Route path="/filmy" element={<FilmsPage />} />
                            <Route path="/kontakt" element={<ContactPage />} />
                            <Route path="/logowanie" element={<LoginPage />} />
                            <Route path="/przypomnij-haslo" element={<ForgotPasswordPage />} />
                            <Route path="/reset-hasla/:token" element={<ResetPasswordPage />} />
                            <Route path="/panel-klienta" element={<ClientPanelPage />} />
                            <Route path="/admin/logowanie" element={<AdminLoginPage />} />
                            <Route path="/rsvp/:token" element={<RsvpPage />} />
                            
                            <Route path="/admin" element={<AdminDashboardPage />}>
                                <Route index element={<Navigate to="/admin/inbox" replace />} />
                                <Route path="inbox" element={<AdminInboxPage />} />
                                <Route path="rezerwacje" element={<AdminBookingsPage />} />
                                <Route path="rezerwacje/:bookingId" element={<AdminBookingDetailsPage />} />
                                <Route path="goscie" element={<AdminGuestsPage />} />
                                <Route path="klucze-dostepu" element={<AdminAccessKeysPage />} />
                                <Route path="dostepnosc" element={<AdminAvailabilityPage />} />
                                <Route path="galeria" element={<AdminGalleryPage />} />
                                <Route path="filmy" element={<AdminFilmsPage />} />
                                <Route path="oferta" element={<AdminPackagesPage />} />
                                <Route path="kody-rabatowe" element={<AdminDiscountsPage />} />
                                <Route path="etapy-produkcji" element={<AdminStagesPage />} />
                                <Route path="ankiety" element={<AdminQuestionnairesPage />} />
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
