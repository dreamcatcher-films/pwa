
import React, { useState, useEffect, FC } from 'react';
import { LoadingSpinner, CheckCircleIcon, TrashIcon, PencilSquareIcon, PlusCircleIcon, PhotoIcon, HomeModernIcon, ChatBubbleBottomCenterTextIcon } from '../components/Icons.tsx';

// --- TYPES ---
interface Slide {
    id: number;
    image_url: string;
    title: string;
    subtitle: string;
    button_text: string;
    button_link: string;
    sort_order: number;
}

interface Testimonial {
    id: number;
    author: string;
    content: string;
}

interface AboutSection {
    title: string;
    text: string;
    image_url: string;
}

// --- MAIN COMPONENT ---
const AdminHomepagePage: FC = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [slides, setSlides] = useState<Slide[]>([]);
    const [aboutSection, setAboutSection] = useState<AboutSection>({ title: '', text: '', image_url: '' });
    const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

    const token = localStorage.getItem('adminAuthToken');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [slidesRes, aboutRes, testimonialsRes] = await Promise.all([
                fetch('/api/admin/homepage/slides', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/admin/homepage/about', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/admin/homepage/testimonials', { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            if (!slidesRes.ok || !aboutRes.ok || !testimonialsRes.ok) {
                throw new Error('Błąd ładowania danych strony głównej.');
            }
            
            const slidesData = await slidesRes.json();
            const aboutData = await aboutRes.json();
            const testimonialsData = await testimonialsRes.json();

            setSlides(slidesData);
            setAboutSection(aboutData);
            setTestimonials(testimonialsData);
            
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        fetchData();
    }, []);
    
    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    if (error) return <p className="text-red-500 bg-red-50 p-3 rounded-lg text-center py-20">{error}</p>;

    return (
        <div className="space-y-12">
            <CarouselManager slides={slides} onDataChange={fetchData} token={token} />
            <AboutUsManager aboutSection={aboutSection} onDataChange={fetchData} token={token} />
            <TestimonialsManager testimonials={testimonials} onDataChange={fetchData} token={token} />
        </div>
    );
};

// --- CAROUSEL MANAGER ---
const CarouselManager: FC<{ slides: Slide[], onDataChange: () => void, token: string | null }> = ({ slides, onDataChange, token }) => {
    // Component logic for managing carousel slides: adding, editing, deleting, reordering
    return (
        <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2"><HomeModernIcon className="w-6 h-6 text-indigo-500" /> Zarządzanie Karuzelą</h2>
            {/* Placeholder for carousel management UI */}
             <p className="text-sm text-slate-500">TODO: Interfejs do dodawania, edycji, usuwania i zmiany kolejności slajdów.</p>
        </div>
    );
};

// --- ABOUT US MANAGER ---
const AboutUsManager: FC<{ aboutSection: AboutSection, onDataChange: () => void, token: string | null }> = ({ aboutSection, onDataChange, token }) => {
    const [formData, setFormData] = useState(aboutSection);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [file, setFile] = useState<File | null>(null);

    useEffect(() => {
        setFormData(aboutSection);
    }, [aboutSection]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setFile(e.target.files[0]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setStatus('idle');
        setMessage('');

        try {
            let imageUrl = formData.image_url;
            if (file) {
                const uploadResponse = await fetch('/api/admin/homepage/about/upload', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'x-vercel-filename': file.name },
                    body: file,
                });
                if (!uploadResponse.ok) throw new Error('Błąd wysyłania zdjęcia.');
                const blob = await uploadResponse.json();
                imageUrl = blob.url;
            }

            const response = await fetch('/api/admin/homepage/about', {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, image_url: imageUrl }),
            });
            if (!response.ok) throw new Error(await response.text());
            
            setStatus('success');
            setMessage('Zapisano pomyślnie!');
            onDataChange();
        } catch (err) {
            setStatus('error');
            setMessage(err instanceof Error ? err.message : 'Wystąpił błąd.');
        } finally {
            setIsSubmitting(false);
            setFile(null);
             if(document.getElementById('aboutImageFile')) {
                (document.getElementById('aboutImageFile') as HTMLInputElement).value = "";
            }
            setTimeout(() => setStatus('idle'), 3000);
        }
    };
    
    return (
        <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Sekcja "O nas"</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                 <input name="title" value={formData.title} onChange={handleChange} placeholder="Nagłówek sekcji" className="block w-full input" />
                 <textarea name="text" value={formData.text} onChange={handleChange} placeholder="Tekst o Was" className="block w-full input" rows={5}></textarea>
                 
                 <div className="flex items-center gap-4">
                    {formData.image_url && <img src={formData.image_url} alt="Podgląd" className="w-24 h-24 object-cover rounded-md" />}
                    <input type="file" id="aboutImageFile" onChange={handleFileChange} accept="image/*" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
                 </div>
                 
                 <div className="flex items-center justify-between">
                    <button type="submit" disabled={isSubmitting} className="flex justify-center items-center w-28 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300">
                        {isSubmitting ? <LoadingSpinner className="w-5 h-5"/> : 'Zapisz'}
                    </button>
                    {status === 'success' && <p className="text-green-600 text-sm flex items-center gap-2"><CheckCircleIcon className="w-5 h-5"/>{message}</p>}
                    {status === 'error' && <p className="text-red-600 text-sm">{message}</p>}
                </div>
            </form>
        </div>
    );
};


// --- TESTIMONIALS MANAGER ---
const TestimonialsManager: FC<{ testimonials: Testimonial[], onDataChange: () => void, token: string | null }> = ({ testimonials, onDataChange, token }) => {
    // Component logic for managing testimonials: adding, editing, deleting
     return (
        <div className="bg-white p-6 rounded-2xl shadow">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2"><ChatBubbleBottomCenterTextIcon className="w-6 h-6 text-indigo-500" /> Zarządzanie Opiniami</h2>
            {/* Placeholder for testimonials management UI */}
            <p className="text-sm text-slate-500">TODO: Interfejs do dodawania, edycji i usuwania opinii.</p>
        </div>
    );
};

export default AdminHomepagePage;
