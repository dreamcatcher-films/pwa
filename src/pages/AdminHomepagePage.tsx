


import React, { useState, useEffect, FC } from 'react';
import { LoadingSpinner, CheckCircleIcon, TrashIcon, PencilSquareIcon, PlusCircleIcon, PhotoIcon, HomeModernIcon, ChatBubbleBottomCenterTextIcon, ArrowUpIcon, ArrowDownIcon, XMarkIcon, InstagramIcon } from '../components/Icons.tsx';

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

interface InstagramPost {
    id: number;
    post_url: string;
    image_url: string;
    caption: string;
    sort_order: number;
}

interface AboutSection {
    title: string;
    text: string;
    image_url: string;
}

const inputClasses = "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";


// --- MAIN COMPONENT ---
const AdminHomepagePage: FC = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [slides, setSlides] = useState<Slide[]>([]);
    const [aboutSection, setAboutSection] = useState<AboutSection>({ title: '', text: '', image_url: '' });
    const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
    const [instagramPosts, setInstagramPosts] = useState<InstagramPost[]>([]);

    const token = localStorage.getItem('adminAuthToken');

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [slidesRes, aboutRes, testimonialsRes, instagramRes] = await Promise.all([
                fetch('/api/admin/homepage/slides', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/admin/homepage/about', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/admin/homepage/testimonials', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/admin/homepage/instagram', { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            if (!slidesRes.ok || !aboutRes.ok || !testimonialsRes.ok || !instagramRes.ok) {
                throw new Error('Błąd ładowania danych strony głównej.');
            }
            
            const slidesData = await slidesRes.json();
            const aboutData = await aboutRes.json();
            const testimonialsData = await testimonialsRes.json();
            const instagramData = await instagramRes.json();

            setSlides(slidesData);
            setAboutSection(aboutData);
            setTestimonials(testimonialsData);
            setInstagramPosts(instagramData);
            
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
            <InstagramManager posts={instagramPosts} onDataChange={fetchData} token={token} />
        </div>
    );
};

// --- MODAL WRAPPER ---
const Modal: FC<{ children: React.ReactNode, onClose: () => void }> = ({ children, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full relative animate-modal-in">
            <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-6 h-6"/>
            </button>
            {children}
        </div>
    </div>
);

// --- CAROUSEL MANAGER ---
const CarouselManager: FC<{ slides: Slide[], onDataChange: () => void, token: string | null }> = ({ slides, onDataChange, token }) => {
    const [editingSlide, setEditingSlide] = useState<Partial<Slide> | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async (slideData: Partial<Slide>, file: File | null) => {
        setIsSubmitting(true);
        setError('');
        try {
            let imageUrl = slideData.image_url;
            if (file) {
                 const uploadResponse = await fetch('/api/admin/homepage/slides/upload', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'x-vercel-filename': file.name },
                    body: file,
                });
                if (!uploadResponse.ok) throw new Error('Błąd wysyłania zdjęcia.');
                const blob = await uploadResponse.json();
                imageUrl = blob.url;
            }

            const endpoint = slideData.id ? `/api/admin/homepage/slides/${slideData.id}` : '/api/admin/homepage/slides';
            const method = slideData.id ? 'PATCH' : 'POST';
            
            const response = await fetch(endpoint, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...slideData, image_url: imageUrl }),
            });
            if (!response.ok) throw new Error(await response.text());
            
            setEditingSlide(null);
            onDataChange();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił błąd zapisu.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (slideId: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć ten slajd?')) return;
        try {
            await fetch(`/api/admin/homepage/slides/${slideId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            onDataChange();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił błąd usuwania.');
        }
    };
    
    const handleReorder = async (slideId: number, direction: 'up' | 'down') => {
        const currentIndex = slides.findIndex(s => s.id === slideId);
        if ((direction === 'up' && currentIndex === 0) || (direction === 'down' && currentIndex === slides.length - 1)) {
            return;
        }
        
        const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        const newSlides = [...slides];
        const [movedSlide] = newSlides.splice(currentIndex, 1);
        newSlides.splice(newIndex, 0, movedSlide);
        
        const orderedIds = newSlides.map(s => s.id);

        try {
            await fetch('/api/admin/homepage/slides/order', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderedIds }),
            });
            onDataChange();
        } catch (err) {
             setError(err instanceof Error ? err.message : 'Wystąpił błąd zmiany kolejności.');
        }
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><HomeModernIcon className="w-6 h-6 text-indigo-500" /> Zarządzanie Karuzelą</h2>
                <button onClick={() => setEditingSlide({})} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                    <PlusCircleIcon className="w-5 h-5"/> Dodaj Slajd
                </button>
            </div>
            {error && <p className="text-red-500 bg-red-50 p-2 rounded-md text-sm mb-4">{error}</p>}
            <ul className="space-y-3">
                {slides.map((slide, index) => (
                    <li key={slide.id} className="flex items-center gap-4 p-2 rounded-lg bg-slate-50">
                        <img src={slide.image_url} alt={slide.title} className="w-24 h-16 object-cover rounded-md" />
                        <div className="flex-grow">
                            <p className="font-bold text-slate-800">{slide.title || '(Brak tytułu)'}</p>
                            <p className="text-sm text-slate-500">{slide.subtitle || '(Brak podtytułu)'}</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={() => handleReorder(slide.id, 'up')} disabled={index === 0} className="p-1 disabled:opacity-30"><ArrowUpIcon className="w-5 h-5"/></button>
                            <button onClick={() => handleReorder(slide.id, 'down')} disabled={index === slides.length - 1} className="p-1 disabled:opacity-30"><ArrowDownIcon className="w-5 h-5"/></button>
                            <button onClick={() => setEditingSlide(slide)} className="p-2 text-slate-500 hover:text-indigo-600"><PencilSquareIcon className="w-5 h-5"/></button>
                            <button onClick={() => handleDelete(slide.id)} className="p-2 text-slate-500 hover:text-red-600"><TrashIcon className="w-5 h-5"/></button>
                        </div>
                    </li>
                ))}
                 {slides.length === 0 && <p className="text-center text-slate-400 py-4">Brak slajdów. Dodaj nowy, aby rozpocząć.</p>}
            </ul>
             {editingSlide && <SlideEditor slide={editingSlide} onClose={() => setEditingSlide(null)} onSave={handleSave} isSubmitting={isSubmitting} />}
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
                 <input name="title" value={formData.title} onChange={handleChange} placeholder="Nagłówek sekcji" className={inputClasses} />
                 <textarea name="text" value={formData.text} onChange={handleChange} placeholder="Tekst o Was" className={inputClasses} rows={5}></textarea>
                 <p className="text-xs text-slate-500 -mt-2 pl-1">Możesz używać formatowania Markdown, np. `**pogrubienie**`, `*kursywa*` lub listy. Czytaj dalej - daj "<!-- more -->"</p>
                 
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
    const [editingTestimonial, setEditingTestimonial] = useState<Partial<Testimonial> | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async (testimonial: Partial<Testimonial>) => {
        setIsSubmitting(true);
        setError('');
        const endpoint = testimonial.id ? `/api/admin/homepage/testimonials/${testimonial.id}` : '/api/admin/homepage/testimonials';
        const method = testimonial.id ? 'PATCH' : 'POST';
        try {
            const response = await fetch(endpoint, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(testimonial),
            });
            if (!response.ok) throw new Error(await response.text());
            setEditingTestimonial(null);
            onDataChange();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił błąd zapisu.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć tę opinię?')) return;
        try {
            await fetch(`/api/admin/homepage/testimonials/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            onDataChange();
        } catch (err) {
             setError(err instanceof Error ? err.message : 'Wystąpił błąd usuwania.');
        }
    };

     return (
        <div className="bg-white p-6 rounded-2xl shadow">
             <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><ChatBubbleBottomCenterTextIcon className="w-6 h-6 text-indigo-500" /> Zarządzanie Opiniami</h2>
                 <button onClick={() => setEditingTestimonial({})} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                    <PlusCircleIcon className="w-5 h-5"/> Dodaj Opinię
                </button>
            </div>
             {error && <p className="text-red-500 bg-red-50 p-2 rounded-md text-sm mb-4">{error}</p>}
             <ul className="space-y-3">
                {testimonials.map(t => (
                    <li key={t.id} className="flex items-start gap-4 p-2 rounded-lg bg-slate-50">
                        <div className="flex-grow">
                            <p className="font-bold text-slate-800">{t.author}</p>
                            <p className="text-sm text-slate-600 italic">"{t.content}"</p>
                        </div>
                         <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => setEditingTestimonial(t)} className="p-2 text-slate-500 hover:text-indigo-600"><PencilSquareIcon className="w-5 h-5"/></button>
                            <button onClick={() => handleDelete(t.id)} className="p-2 text-slate-500 hover:text-red-600"><TrashIcon className="w-5 h-5"/></button>
                        </div>
                    </li>
                ))}
                {testimonials.length === 0 && <p className="text-center text-slate-400 py-4">Brak opinii. Dodaj nową, aby rozpocząć.</p>}
            </ul>
             {editingTestimonial && <TestimonialEditor testimonial={editingTestimonial} onClose={() => setEditingTestimonial(null)} onSave={handleSave} isSubmitting={isSubmitting} />}
        </div>
    );
};

// --- INSTAGRAM MANAGER ---
const InstagramManager: FC<{ posts: InstagramPost[], onDataChange: () => void, token: string | null }> = ({ posts, onDataChange, token }) => {
    const [editingPost, setEditingPost] = useState<Partial<InstagramPost> | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async (postData: Partial<InstagramPost>, file: File | null) => {
        setIsSubmitting(true);
        setError('');
        try {
            if (!file && !postData.image_url) {
                throw new Error("Plik obrazu jest wymagany.");
            }
            let imageUrl = postData.image_url;
            if (file) {
                 const uploadResponse = await fetch('/api/admin/homepage/instagram/upload', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'x-vercel-filename': file.name },
                    body: file,
                });
                if (!uploadResponse.ok) throw new Error('Błąd wysyłania zdjęcia.');
                const blob = await uploadResponse.json();
                imageUrl = blob.url;
            }

            const response = await fetch('/api/admin/homepage/instagram', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...postData, image_url: imageUrl }),
            });
            if (!response.ok) throw new Error(await response.text());
            
            setEditingPost(null);
            onDataChange();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił błąd zapisu.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (postId: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć ten post z feedu?')) return;
        try {
            await fetch(`/api/admin/homepage/instagram/${postId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            onDataChange();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił błąd usuwania.');
        }
    };
    
    const handleReorder = async (postId: number, direction: 'up' | 'down') => {
        const currentIndex = posts.findIndex(p => p.id === postId);
        if ((direction === 'up' && currentIndex === 0) || (direction === 'down' && currentIndex === posts.length - 1)) {
            return;
        }
        
        const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        const newPosts = [...posts];
        const [movedPost] = newPosts.splice(currentIndex, 1);
        newPosts.splice(newIndex, 0, movedPost);
        
        const orderedIds = newPosts.map(p => p.id);

        try {
            await fetch('/api/admin/homepage/instagram/order', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderedIds }),
            });
            onDataChange();
        } catch (err) {
             setError(err instanceof Error ? err.message : 'Wystąpił błąd zmiany kolejności.');
        }
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><InstagramIcon className="w-6 h-6 text-indigo-500" /> Zarządzanie feedem z Instagrama</h2>
                <button onClick={() => setEditingPost({})} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                    <PlusCircleIcon className="w-5 h-5"/> Dodaj Post
                </button>
            </div>
            {error && <p className="text-red-500 bg-red-50 p-2 rounded-md text-sm mb-4">{error}</p>}
            <ul className="space-y-3">
                {posts.map((post, index) => (
                    <li key={post.id} className="flex items-center gap-4 p-2 rounded-lg bg-slate-50">
                        <img src={post.image_url} alt={post.caption} className="w-16 h-16 object-cover rounded-md" />
                        <div className="flex-grow">
                            <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="font-bold text-slate-800 hover:text-indigo-600 hover:underline break-all">{post.post_url}</a>
                            <p className="text-sm text-slate-500">{post.caption || '(Brak opisu)'}</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={() => handleReorder(post.id, 'up')} disabled={index === 0} className="p-1 disabled:opacity-30"><ArrowUpIcon className="w-5 h-5"/></button>
                            <button onClick={() => handleReorder(post.id, 'down')} disabled={index === posts.length - 1} className="p-1 disabled:opacity-30"><ArrowDownIcon className="w-5 h-5"/></button>
                            <button onClick={() => handleDelete(post.id)} className="p-2 text-slate-500 hover:text-red-600"><TrashIcon className="w-5 h-5"/></button>
                        </div>
                    </li>
                ))}
                {posts.length === 0 && <p className="text-center text-slate-400 py-4">Brak postów. Dodaj nowy, aby go tu wyświetlić.</p>}
            </ul>
            {editingPost && <InstagramPostEditor post={editingPost} onClose={() => setEditingPost(null)} onSave={handleSave} isSubmitting={isSubmitting} />}
        </div>
    );
};

// --- EDITOR MODALS ---
const SlideEditor: FC<{ slide: Partial<Slide>, onClose: () => void, onSave: (data: Partial<Slide>, file: File | null) => void, isSubmitting: boolean }> = ({ slide, onClose, onSave, isSubmitting }) => {
    const [formData, setFormData] = useState(slide);
    const [file, setFile] = useState<File | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, [e.target.name]: e.target.value }));
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) setFile(e.target.files[0]); };
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData, file); };
    
    return (
        <Modal onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-xl font-bold text-slate-800">{slide.id ? 'Edytuj Slajd' : 'Nowy Slajd'}</h3>
                <input name="title" value={formData.title || ''} onChange={handleChange} placeholder="Tytuł" className={inputClasses} />
                <input name="subtitle" value={formData.subtitle || ''} onChange={handleChange} placeholder="Podtytuł" className={inputClasses} />
                <input name="button_text" value={formData.button_text || ''} onChange={handleChange} placeholder="Tekst na przycisku" className={inputClasses} />
                <input name="button_link" value={formData.button_link || ''} onChange={handleChange} placeholder="Link przycisku (np. /calculator)" className={inputClasses} />
                <div className="flex items-center gap-4">
                    {formData.image_url && !file && <img src={formData.image_url} alt="Podgląd" className="w-16 h-16 object-cover rounded-md" />}
                    <input type="file" onChange={handleFileChange} accept="image/*" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
                </div>
                 <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onClose} disabled={isSubmitting} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg">Anuluj</button>
                    <button type="submit" disabled={isSubmitting} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center w-28">
                        {isSubmitting ? <LoadingSpinner className="w-5 h-5"/> : 'Zapisz'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

const TestimonialEditor: FC<{ testimonial: Partial<Testimonial>, onClose: () => void, onSave: (data: Partial<Testimonial>) => void, isSubmitting: boolean }> = ({ testimonial, onClose, onSave, isSubmitting }) => {
    const [formData, setFormData] = useState(testimonial);
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData(p => ({ ...p, [e.target.name]: e.target.value }));
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData); };

    return (
        <Modal onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-xl font-bold text-slate-800">{testimonial.id ? 'Edytuj Opinię' : 'Nowa Opinia'}</h3>
                <input name="author" value={formData.author || ''} onChange={handleChange} placeholder="Autor (np. Anna i Piotr)" className={inputClasses} required />
                <textarea name="content" value={formData.content || ''} onChange={handleChange} placeholder="Treść opinii" className={inputClasses} rows={4} required></textarea>
                 <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onClose} disabled={isSubmitting} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg">Anuluj</button>
                    <button type="submit" disabled={isSubmitting} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center w-28">
                        {isSubmitting ? <LoadingSpinner className="w-5 h-5"/> : 'Zapisz'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

const InstagramPostEditor: FC<{ post: Partial<InstagramPost>, onClose: () => void, onSave: (data: Partial<InstagramPost>, file: File | null) => void, isSubmitting: boolean }> = ({ post, onClose, onSave, isSubmitting }) => {
    const [formData, setFormData] = useState(post);
    const [file, setFile] = useState<File | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFormData(p => ({ ...p, [e.target.name]: e.target.value }));
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) setFile(e.target.files[0]); };
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(formData, file); };
    
    return (
        <Modal onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-xl font-bold text-slate-800">Nowy Post z Instagrama</h3>
                <input name="post_url" value={formData.post_url || ''} onChange={handleChange} placeholder="Link do posta na Instagramie" className={inputClasses} required />
                <textarea name="caption" value={formData.caption || ''} onChange={handleChange} placeholder="Krótki opis (opcjonalnie)" className={inputClasses} rows={2}></textarea>
                <div>
                    <label className="block text-sm font-medium text-slate-700">Zdjęcie z posta</label>
                    <input type="file" onChange={handleFileChange} accept="image/*" required className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
                </div>
                 <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onClose} disabled={isSubmitting} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg">Anuluj</button>
                    <button type="submit" disabled={isSubmitting || !file} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center w-28">
                        {isSubmitting ? <LoadingSpinner className="w-5 h-5"/> : 'Zapisz'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default AdminHomepagePage;
