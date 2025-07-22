import React, { useRef, MouseEvent, TouchEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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
}

export const HeroCarousel: React.FC<HeroCarouselProps> = ({ slides }) => {
    const carouselRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const isHovering = useRef(false);
    const startX = useRef(0);
    const scrollLeft = useRef(0);
    const hasDragged = useRef(false);
    const animationFrameId = useRef<number | null>(null);
    const navigate = useNavigate();

    if (!slides || slides.length === 0) {
        return null;
    }

    const startDragging = (pageX: number) => {
        if (!carouselRef.current) return;
        isDragging.current = true;
        startX.current = pageX - carouselRef.current.offsetLeft;
        scrollLeft.current = carouselRef.current.scrollLeft;
        hasDragged.current = false;
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
    };

    const stopDragging = () => {
        if (!isDragging.current) return;
        isDragging.current = false;
    };

    const onDrag = (pageX: number) => {
        if (!isDragging.current || !carouselRef.current) return;
        const x = pageX - carouselRef.current.offsetLeft;
        const walk = (x - startX.current) * 1.5;
        carouselRef.current.scrollLeft = scrollLeft.current - walk;

        if (Math.abs(walk) > 5) {
            hasDragged.current = true;
        }
    };

    useEffect(() => {
        const carousel = carouselRef.current;
        if (!carousel) return;

        const animateScroll = () => {
            if (!isDragging.current && !isHovering.current) {
                carousel.scrollLeft += 0.5; // Scroll speed
                if (carousel.scrollLeft >= carousel.scrollWidth / 2) {
                    carousel.scrollLeft = 0;
                }
            }
            animationFrameId.current = requestAnimationFrame(animateScroll);
        };

        animateScroll();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, []);

    const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
        if (!isDragging.current) return;
        e.preventDefault();
        onDrag(e.pageX);
    };
    
    const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
        if (!isDragging.current) return;
        onDrag(e.touches[0].pageX);
    };

    const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, link: string) => {
        if (hasDragged.current) {
            e.preventDefault();
            return;
        }
        if (link.startsWith('/')) {
            e.preventDefault();
            navigate(link);
        }
    };

    // Duplicating slides to create an infinite loop effect
    const duplicatedSlides = slides.length > 0 ? [...slides, ...slides, ...slides] : [];

    return (
        <div className="w-full h-[550px] relative py-8">
            <div
                ref={carouselRef}
                className="flex items-center h-full cursor-grab will-change-transform overflow-x-auto scrollbar-hide"
                onMouseEnter={() => (isHovering.current = true)}
                onMouseLeave={() => { isHovering.current = false; stopDragging(); }}
                onMouseDown={(e) => startDragging(e.pageX)}
                onMouseUp={stopDragging}
                onMouseMove={handleMouseMove}
                onTouchStart={(e) => startDragging(e.touches[0].pageX)}
                onTouchEnd={stopDragging}
                onTouchMove={handleTouchMove}
            >
                {duplicatedSlides.map((slide, index) => (
                    <a
                        key={`${slide.id}-${index}`}
                        href={slide.button_link || '#'}
                        onClick={(e) => slide.button_link && handleLinkClick(e, slide.button_link)}
                        target={slide.button_link && !slide.button_link.startsWith('/') ? '_blank' : '_self'}
                        rel="noopener noreferrer"
                        className="flex-shrink-0 h-full w-auto mx-4 focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:ring-offset-2 rounded-2xl transition-transform duration-300 ease-in-out hover:scale-105 hover:z-20"
                        aria-label={`Zobacz realizację: ${slide.title}`}
                        draggable="false"
                    >
                        <img
                            src={slide.image_url}
                            alt={slide.title}
                            className="h-full w-auto object-contain rounded-2xl drop-shadow-lg pointer-events-none"
                            draggable="false"
                        />
                    </a>
                ))}
            </div>
        </div>
    );
};
