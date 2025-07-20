import React from 'react';
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
    
    if (!slides || slides.length === 0) {
        return null;
    }

    const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, link: string) => {
        if (link.startsWith('/')) {
            e.preventDefault();
            const page = link.substring(1) as Page;
            navigateTo(page);
        }
    };

    const duplicatedSlides = [...slides, ...slides];

    return (
        <div className="w-full h-[70vh] max-h-[700px] overflow-hidden relative group cursor-grab active:cursor-grabbing">
             <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-slate-50/50 to-slate-50 z-10"></div>
            <div
                className="flex items-center h-full animate-scroll-filmstrip group-hover:[animation-play-state:paused]"
            >
                {duplicatedSlides.map((slide, index) => (
                    <a
                        key={`${slide.id}-${index}`}
                        href={slide.button_link || '#'}
                        onClick={(e) => slide.button_link && handleLinkClick(e, slide.button_link)}
                        target={slide.button_link && !slide.button_link.startsWith('/') ? '_blank' : '_self'}
                        rel="noopener noreferrer"
                        className="flex-shrink-0 h-full w-auto mx-2 focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:ring-offset-2 rounded-2xl"
                        aria-label={`Zobacz realizację: ${slide.title}`}
                    >
                        <img
                            src={slide.image_url}
                            alt={slide.title}
                            className="h-full w-auto object-contain rounded-2xl shadow-xl transition-transform duration-300 group-hover:scale-95 hover:!scale-100"
                        />
                    </a>
                ))}
            </div>
             <div className="absolute inset-0 bg-gradient-to-t from-slate-50 via-slate-50/50 to-slate-50 z-10"></div>
        </div>
    );
};

export default HeroCarousel;
