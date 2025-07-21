


import React, { useState, useEffect } from 'react';
import { Page } from '../App.tsx';
import { LoadingSpinner, ChatBubbleBottomCenterTextIcon, InstagramIcon } from '../components/Icons.tsx';
import HeroCarousel from '../components/HeroCarousel.tsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface HomePageProps {
    navigateTo: (page: Page) => void;
}

interface Slide {
    id: number;
    image_url: string;
    title: string;
    subtitle: string;
    button_text: string;
    button_link: string;
}

interface Testimonial {
    id: number;
    author: string;
    content: string;
}

interface InstagramPost {
    id: number;
    post_url: string;
    image_url: string;
    caption: string;
}

interface AboutSection {
    about_us_title: string;
    about_us_text: string;
    about_us_image_url: string;
}

interface HomePageContent {
    slides: Slide[];
    testimonials: Testimonial[];
    instagramPosts: InstagramPost[];
    aboutSection: AboutSection;
}

const HomePage: React.FC<HomePageProps> = ({ navigateTo }) => {
    const [content, setContent] = useState<HomePageContent | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchContent = async () => {
            try {
                const response = await fetch('/api/homepage-content');
                if (!response.ok) {
                    throw new Error('Nie udało się załadować zawartości strony.');
                }
                const data = await response.json();
                setContent(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchContent();
    }, []);

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    }

    if (error) {
        return <div className="text-center py-20"><p className="text-red-500">{error}</p></div>;
    }

    if (!content) {
        return <div className="text-center py-20">Brak zawartości do wyświetlenia.</div>;
    }

    const { slides, aboutSection, testimonials, instagramPosts } = content;

    return (
        <div className="space-y-16 md:space-y-24">
            {slides.length > 0 && <HeroCarousel slides={slides} navigateTo={navigateTo} />}

            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid md:grid-cols-2 gap-12 items-center">
                    {aboutSection.about_us_image_url && (
                        <div className="order-1 md:order-2">
                            <img src={aboutSection.about_us_image_url} alt="O nas" className="rounded-2xl shadow-xl w-full h-auto object-cover" />
                        </div>
                    )}
                    <div className="order-2 md:order-1">
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{aboutSection.about_us_title}</h2>
                        <div className="mt-4 text-lg text-slate-600 [&_p]:mb-4 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:list-inside [&_ol]:list-decimal [&_ol]:list-inside">
                           <ReactMarkdown remarkPlugins={[remarkGfm]}>{aboutSection.about_us_text}</ReactMarkdown>
                        </div>
                    </div>
                </div>
            </section>
            
            {testimonials.length > 0 && (
                <section className="bg-slate-100 py-16">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center">
                            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Opinie naszych Klientów</h2>
                            <p className="mt-4 text-lg text-slate-600">Zobacz, co mówią o nas pary, z którymi mieliśmy przyjemność współpracować.</p>
                        </div>
                        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                            {testimonials.map((testimonial) => (
                                <blockquote key={testimonial.id} className="bg-white p-6 rounded-2xl shadow-md">
                                    <div className="flex-grow">
                                        <ChatBubbleBottomCenterTextIcon className="w-8 h-8 text-indigo-300" />
                                        <p className="mt-4 text-slate-700">"{testimonial.content}"</p>
                                    </div>
                                    <footer className="mt-4">
                                        <p className="font-semibold text-slate-900">{testimonial.author}</p>
                                    </footer>
                                </blockquote>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {instagramPosts && instagramPosts.length > 0 && (
                 <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center">
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl flex items-center justify-center gap-3">
                            <InstagramIcon className="w-8 h-8"/>
                            Znajdź nas na Instagramie
                        </h2>
                        <p className="mt-4 text-lg text-slate-600">Zobacz nasze ostatnie prace i kulisy naszej działalności.</p>
                    </div>
                     <div className="mt-12 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {instagramPosts.map((post) => (
                            <a
                                key={post.id}
                                href={post.post_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group aspect-square block bg-black rounded-2xl overflow-hidden shadow-lg relative"
                            >
                                <img
                                    alt={post.caption || 'Post z Instagrama'}
                                    src={post.image_url}
                                    className="absolute inset-0 h-full w-full object-cover opacity-90 transition-all duration-300 group-hover:opacity-75 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <InstagramIcon className="w-12 h-12 text-white drop-shadow-lg" />
                                </div>
                            </a>
                        ))}
                    </div>
                     <div className="mt-10 text-center">
                         <a href="https://www.instagram.com/dreamcatcher_film_" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-slate-800 text-white font-bold py-3 px-6 rounded-lg hover:bg-slate-900 transition-colors">
                            <InstagramIcon className="w-5 h-5"/>
                            Obserwuj nas
                         </a>
                    </div>
                </section>
            )}

            <section className="max-w-5xl mx-auto text-center py-16 px-4 sm:px-6 lg:px-8">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Gotowi, by stworzyć własną historię?</h2>
                <p className="mt-4 text-xl text-slate-600 max-w-2xl mx-auto">
                    Sprawdź naszą ofertę lub skontaktuj się z nami, aby omówić szczegóły Twojego wymarzonego dnia.
                </p>
                <div className="mt-10 flex justify-center gap-4 flex-wrap">
                     <button
                        onClick={() => navigateTo('calculator')}
                        className="bg-indigo-600 text-white font-bold py-4 px-8 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-transform hover:scale-105 shadow-lg"
                    >
                        Stwórz Swój Pakiet
                    </button>
                    <button
                        onClick={() => navigateTo('contact')}
                        className="bg-slate-200 text-slate-800 font-bold py-4 px-8 rounded-lg hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition"
                    >
                       Skontaktuj się z nami
                    </button>
                </div>
            </section>
        </div>
    );
};

export default HomePage;
