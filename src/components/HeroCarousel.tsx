
import React, { useState, useEffect, useCallback } from 'react';
import { Page } from '../App.tsx';

interface Slide {
    id: number;
    image_url: string;
    title: string;
    subtitle: string;
    button_text: string;
    button_link: string;
}

interface HeroCarouselProps {
    slides: Slide[];
    navigateTo: (page: Page) => void;
}

const HeroCarousel: React.FC<HeroCarouselProps> = ({ slides, navigateTo }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    const goToNext = useCallback(() => {
        const isLastSlide = currentIndex === slides.length - 1;
        const newIndex = isLastSlide ? 0 : currentIndex + 1;
        setCurrentIndex(newIndex);
    }, [currentIndex, slides.length]);

    useEffect(() => {
        const timer = setTimeout(goToNext, 5000);
        return () => clearTimeout(timer);
    }, [goToNext]);

    const goToSlide = (slideIndex: number) => {
        setCurrentIndex(slideIndex);
    };

    const handleButtonClick = (link: string) => {
        if (link.startsWith('/')) {
            const page = link.substring(1) as Page;
            navigateTo(page);
        } else {
            window.open(link, '_blank');
        }
    }

    if (!slides || slides.length === 0) {
        return null;
    }

    return (
        <div className="h-[60vh] md:h-[80vh] w-full m-auto relative group">
            <div
                style={{ backgroundImage: `url(${slides[currentIndex].image_url})` }}
                className="w-full h-full bg-center bg-cover duration-500"
            >
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="text-center text-white p-4 max-w-3xl">
                        <h1 className="text-4xl md:text-6xl font-bold font-cinzel tracking-wider">{slides[currentIndex].title}</h1>
                        <p className="mt-4 text-lg md:text-2xl">{slides[currentIndex].subtitle}</p>
                        {slides[currentIndex].button_text && slides[currentIndex].button_link && (
                             <button
                                onClick={() => handleButtonClick(slides[currentIndex].button_link)}
                                className="mt-8 bg-indigo-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-transform hover:scale-105 shadow-lg"
                            >
                                {slides[currentIndex].button_text}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex top-4 justify-center py-2 absolute bottom-5 left-1/2 -translate-x-1/2">
                {slides.map((slide, slideIndex) => (
                    <div
                        key={slide.id}
                        onClick={() => goToSlide(slideIndex)}
                        className={`text-2xl cursor-pointer p-1 mx-1 ${currentIndex === slideIndex ? 'text-white' : 'text-white/50'}`}
                    >
                        ●
                    </div>
                ))}
            </div>
        </div>
    );
};

export default HeroCarousel;
