import React from 'react';

interface HomePageProps {
    onNavigateToCalculator: () => void;
}

const HomePage: React.FC<HomePageProps> = ({ onNavigateToCalculator }) => {
    return (
        <div className="flex flex-col items-center justify-center text-center py-20">
            <h1 className="text-5xl font-bold tracking-tight text-slate-900">Witaj w Dreamcatcher Films</h1>
            <p className="mt-4 text-xl text-slate-600 max-w-2xl">
                Twoje wspomnienia, nasza pasja. Stwórz z nami niezapomnianą pamiątkę na całe życie.
            </p>
            <button
                onClick={onNavigateToCalculator}
                className="mt-10 bg-indigo-600 text-white font-bold py-4 px-8 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-transform hover:scale-105 shadow-lg"
            >
                Przejdź do Kalkulatora Usług
            </button>
        </div>
    );
};

export default HomePage;
