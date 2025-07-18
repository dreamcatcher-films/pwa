import React, { useState, useEffect } from 'react';
import { LoadingSpinner } from '../components/Icons';

interface GalleryItem {
    id: number;
    title: string;
    description: string;
    image_url: string;
}

const GalleryPage: React.FC = () => {
    const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchGallery = async () => {
            try {
                const response = await fetch('/api/gallery');
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || 'Nie udało się pobrać galerii.');
                }
                setGalleryItems(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchGallery();
    }, []);

    return (
        <div>
            <header className="text-center mb-12">
                <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Galeria Realizacji</h1>
                <p className="mt-4 text-xl text-slate-600">Zobacz magię, którą tworzymy. Oto wybrane historie, które mieliśmy zaszczyt uwiecznić.</p>
            </header>

            {isLoading && (
                <div className="flex justify-center items-center py-20">
                    <LoadingSpinner className="w-12 h-12 text-indigo-600" />
                </div>
            )}
            {error && <p className="text-red-500 text-center py-20">{error}</p>}

            {!isLoading && !error && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                    {galleryItems.length > 0 ? galleryItems.map(item => (
                        <div key={item.id} className="group relative block bg-black rounded-2xl overflow-hidden shadow-lg">
                            <img
                                alt={item.title}
                                src={item.image_url}
                                className="absolute inset-0 h-full w-full object-cover opacity-75 transition-opacity group-hover:opacity-50"
                            />
                            <div className="relative p-6">
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                                <div className="relative mt-32">
                                    <h3 className="text-2xl font-bold text-white">{item.title}</h3>
                                    <p className="mt-2 text-sm text-gray-300">{item.description}</p>
                                </div>
                            </div>
                        </div>
                    )) : (
                        <p className="col-span-full text-center text-slate-500 py-20">Galeria jest obecnie pusta. Zapraszamy wkrótce!</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default GalleryPage;