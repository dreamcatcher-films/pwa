import React, { useRef, MouseEvent, TouchEvent } from 'react';
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
    const carouselRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const startX = useRef(0);
    const scrollLeft = useRef(0);
    const hasDragged = useRef(false);

    if (!slides || slides.length === 0) {
        return null;
    }

    const startDragging = (pageX: number) => {
        if (!carouselRef.current) return;
        isDragging.current = true;
        startX.current = pageX - carouselRef.current.offsetLeft;
        scrollLeft.current = carouselRef.current.scrollLeft;
        hasDragged.current = false;
    };

    const stopDragging = () => {
        isDragging.current = false;
    };

    const onDrag = (pageX: number) => {
        if (!isDragging.current || !carouselRef.current) return;
        const x = pageX - carouselRef.current.offsetLeft;
        const walk = (x - startX.current) * 1.5; // Drag speed multiplier
        carouselRef.current.scrollLeft = scrollLeft.current - walk;
        if (Math.abs(walk) > 5) { // Threshold to count as a drag
            hasDragged.current = true;
        }
    };

    // Mouse Events
    const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => startDragging(e.pageX);
    const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
        if (!isDragging.current) return;
        e.preventDefault();
        onDrag(e.pageX);
    };
    const handleMouseUp = () => stopDragging();
    const handleMouseLeave = () => stopDragging();

    // Touch Events
    const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => startDragging(e.touches[0].pageX);
    const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
        if (!isDragging.current) return;
        onDrag(e.touches[0].pageX);
    };
    const handleTouchEnd = () => stopDragging();

    // Click prevention after drag
    const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, link: string) => {
        if (hasDragged.current) {
            e.preventDefault();
            return;
        }

        if (link.startsWith('/')) {
            e.preventDefault();
            const page = link.substring(1) as Page;
            navigateTo(page);
        }
    };

    const duplicatedSlides = [...slides, ...slides];

    return (
        <div className="w-full h-[70vh] max-h-[700px] overflow-hidden relative group">
            <div
                ref={carouselRef}
                className="flex items-center h-full animate-scroll-filmstrip group-hover:[animation-play-state:paused] cursor-grab active:cursor-grabbing will-change-transform overflow-x-auto scrollbar-hide"
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
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
                        draggable="false"
                    >
                        <img
                            src={slide.image_url}
                            alt={slide.title}
                            className="h-full w-auto object-contain rounded-2xl shadow-xl transition-transform duration-300 group-hover:scale-95 hover:!scale-100 pointer-events-none"
                            draggable="false"
                        />
                    </a>
                ))}
            </div>
        </div>
    );
};

export default HeroCarousel;
