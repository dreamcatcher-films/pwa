import React, { useState, useCallback } from 'react';
import HomePage from './pages/HomePage.tsx';
import CalculatorPage from './pages/CalculatorPage.tsx';
import Header from './components/Header.tsx';
import SideMenu from './components/SideMenu.tsx';
import LoginPage from './pages/LoginPage.tsx';
import ClientPanelPage from './pages/ClientPanelPage.tsx';
import AdminLoginPage from './pages/AdminLoginPage.tsx';
import AdminDashboardPage from './pages/AdminDashboardPage.tsx';

export type Page = 'home' | 'calculator' | 'login' | 'clientPanel' | 'adminLogin' | 'adminDashboard';

const App = () => {
    const [currentPage, setCurrentPage] = useState<Page>('home');
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const navigateTo = useCallback((page: Page) => {
        setCurrentPage(page);
        setIsMenuOpen(false);
    }, []);

    const renderCurrentPage = () => {
        switch (currentPage) {
            case 'home':
                return <HomePage onNavigateToCalculator={() => navigateTo('calculator')} />;
            case 'calculator':
                return <CalculatorPage navigateTo={navigateTo} />;
            case 'login':
                return <LoginPage navigateTo={navigateTo} />;
            case 'clientPanel':
                return <ClientPanelPage navigateTo={navigateTo} />;
            case 'adminLogin':
                return <AdminLoginPage navigateTo={navigateTo} />;
            case 'adminDashboard':
                return <AdminDashboardPage navigateTo={navigateTo} />;
            default:
                return <HomePage onNavigateToCalculator={() => navigateTo('calculator')} />;
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans">
            <Header onMenuToggle={() => setIsMenuOpen(!isMenuOpen)} />
            <SideMenu isOpen={isMenuOpen} onNavigate={navigateTo} onClose={() => setIsMenuOpen(false)} />
            <main className="p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto">
                    {renderCurrentPage()}
                </div>
            </main>
        </div>
    );
};

export default App;
