

import React, { useState, FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFilms } from '../api.ts';
import { LoadingSpinner, XMarkIcon, YouTubeIcon } from '../components/Icons.tsx';

// --- TYPES ---
interface Film {
    id: number;
    title: string;
    description: string;
    thumbnail_url: string;
    youtube_url: string;
}

interface FilmPageSettings {
    title?: string;
    subtitle?: string;
    hero_url?: string;
}

interface FilmsPageData {
    films: Film[];
    settings: FilmPageSettings;
}

// --- HELPER FUNCTIONS ---
const getYouTubeVideoId = (url: string): string | null => {
    let videoId: string | null = null;
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
            videoId = urlObj.searchParams.get('v');
        } else if (urlObj.hostname === 'youtu.be') {
            videoId = urlObj.pathname.substring(1);
        }
    } catch (e) {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        if (match) {
            videoId = match[1];
        }
    }
    return videoId;
};

// --- UI COMPONENTS ---
const VideoPlayerModal: FC<{ film: Film; onClose: () => void }> = ({ film, onClose }) => {
    const videoId = getYouTubeVideoId(film.youtube_url);
    if (!videoId) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-black rounded-2xl shadow-2xl w-full max-w-4xl relative animate-modal-in" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute -top-4 -right-4 text-white bg-black rounded-full p-2 hover:bg-slate-800" aria-label="Zamknij">
                    <XMarkIcon className="w-6 h-6" />
                </button>
                <div className="aspect-w-16 aspect-h-9">
                    <iframe
                        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                        title={film.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full rounded-lg"
                    ></iframe>
                </div>
            </div>
        </div>
    );
};

// --- MAIN PAGE COMPONENT ---
const FilmsPage: FC = () => {
    const [selectedFilm, setSelectedFilm] = useState<Film | null>(null);
    const { data, isLoading, error } = useQuery<FilmsPageData, Error>({
        queryKey: ['filmsPageData'],
        queryFn: getFilms
    });
    
    const films = data?.films;
    const settings = data?.settings;
    
    const headerStyle = settings?.hero_url ? { backgroundImage: `url(${settings.hero_url})` } : {};

    return (
        <div>
            <header 
                className="relative bg-slate-800 bg-cover bg-center text-center py-20 px-4 sm:px-6 lg:px-8"
                style={headerStyle}
            >
                <div className="absolute inset-0 bg-black/60"></div>
                <div className="relative max-w-3xl mx-auto">
                    <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl drop-shadow-lg">
                        {settings?.title || 'Nasze Realizacje Filmowe'}
                    </h1>
                    <p className="mt-4 text-xl text-slate-200 drop-shadow">
                        {settings?.subtitle || 'Każdy film to unikalna historia miłości, opowiedziana z pasją i dbałością o najmniejszy detal. Zapraszamy do obejrzenia.'}
                    </p>
                </div>
            </header>
            
            <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
                {isLoading && (
                    <div className="flex justify-center items-center py-20">
                        <LoadingSpinner className="w-12 h-12 text-indigo-600" />
                    </div>
                )}
                {error && <p className="text-red-500 text-center py-20">{error.message}</p>}
                
                {!isLoading && !error && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                        {films && films.length > 0 ? films.map(film => (
                            <div key={film.id} className="group cursor-pointer" onClick={() => setSelectedFilm(film)}>
                                <div className="relative block bg-black rounded-2xl overflow-hidden shadow-lg aspect-video">
                                    <img
                                        alt={film.title}
                                        src={film.thumbnail_url}
                                        className="absolute inset-0 h-full w-full object-cover opacity-80 transition-all duration-300 group-hover:opacity-60 group-hover:scale-105"
                                    />
                                     <div className="absolute inset-0 flex items-center justify-center">
                                        <YouTubeIcon className="w-16 h-16 text-white/80 drop-shadow-lg transform transition-transform group-hover:scale-110" />
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <h3 className="text-xl font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{film.title}</h3>
                                    <p className="mt-1 text-sm text-slate-500">{film.description}</p>
                                </div>
                            </div>
                        )) : (
                            <p className="col-span-full text-center text-slate-500 py-20">Brak filmów do wyświetlenia. Zapraszamy wkrótce!</p>
                        )}
                    </div>
                )}
            </main>
            {selectedFilm && <VideoPlayerModal film={selectedFilm} onClose={() => setSelectedFilm(null)} />}
        </div>
    );
};

export default FilmsPage;
