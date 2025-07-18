import React, { useState, useEffect, FC } from 'react';
import { LoadingSpinner, CheckCircleIcon, TrashIcon, PencilSquareIcon, PlusCircleIcon } from '../components/Icons.tsx';
import { formatCurrency } from '../utils.ts';

// --- TYPES ---
interface Addon {
    id: number;
    name: string;
    price: number;
}

interface PackageAddon extends Addon {
    is_locked: boolean;
}

interface Package {
    id: number;
    name: string;
    description: string;
    price: number;
    addons: PackageAddon[];
}

// --- MODAL COMPONENT ---
interface ModalProps {
    children: React.ReactNode;
    onClose: () => void;
}
const Modal: FC<ModalProps> = ({ children, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full relative animate-modal-in">
            <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                &times;
            </button>
            {children}
        </div>
    </div>
);


// --- MAIN COMPONENT ---
const AdminPackagesPage: FC = () => {
    const [packages, setPackages] = useState<Package[]>([]);
    const [addons, setAddons] = useState<Addon[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const [editingPackage, setEditingPackage] = useState<Package | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const token = localStorage.getItem('adminAuthToken');

    const fetchData = async () => {
        setIsLoading(true);
        setError('');
        try {
            const [packagesRes, addonsRes] = await Promise.all([
                fetch('/api/admin/packages', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/admin/addons', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (!packagesRes.ok) {
                const errorText = await packagesRes.text();
                throw new Error(errorText || 'Błąd ładowania pakietów.');
            }
            if (!addonsRes.ok) {
                const errorText = await addonsRes.text();
                throw new Error(errorText || 'Błąd ładowania dodatków.');
            }
            
            const packagesData = await packagesRes.json();
            const addonsData = await addonsRes.json();

            setPackages(packagesData);
            setAddons(addonsData);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        fetchData();
    }, []);
    
    // --- Package Management ---
    const handleSavePackage = async (pkg: Package) => {
        setIsSubmitting(true);
        setError('');
        const endpoint = pkg.id ? `/api/admin/packages/${pkg.id}` : '/api/admin/packages';
        const method = pkg.id ? 'PATCH' : 'POST';

        try {
            const response = await fetch(endpoint, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(pkg)
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Nie udało się zapisać pakietu.');
            }
            await fetchData();
            setEditingPackage(null);
        } catch(err) {
            setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeletePackage = async (packageId: number) => {
        if (!window.confirm('Czy na pewno chcesz usunąć ten pakiet?')) return;
        try {
            const response = await fetch(`/api/admin/packages/${packageId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
             if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Błąd usuwania pakietu.');
            }
            fetchData();
        } catch (err) {
             setError(err instanceof Error ? err.message : 'Wystąpił nieznany błąd.');
        }
    };

    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    if (error) return <p className="text-red-500 bg-red-50 p-3 rounded-lg text-center py-20">{error}</p>;

    return (
        <div>
             {error && <p className="text-red-500 bg-red-50 p-3 rounded-lg mb-4">{error}</p>}
            <div className="grid grid-cols-1 gap-12">
                {/* Packages Section */}
                <div>
                     <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold text-slate-800">Pakiety</h2>
                        <button onClick={() => setEditingPackage({ id: 0, name: '', description: '', price: 0, addons: [] })} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                           <PlusCircleIcon className="w-5 h-5"/> Dodaj Pakiet
                        </button>
                    </div>
                     <div className="bg-white rounded-2xl shadow overflow-hidden">
                        <ul className="divide-y divide-slate-200">
                             {packages.map(pkg => (
                                <li key={pkg.id} className="p-4 flex justify-between items-center hover:bg-slate-50">
                                    <div>
                                        <p className="font-bold text-slate-800">{pkg.name}</p>
                                        <p className="text-sm text-slate-500">{pkg.description}</p>
                                        <p className="text-sm font-semibold text-indigo-600">{formatCurrency(pkg.price)}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setEditingPackage(pkg)} className="p-2 text-slate-500 hover:text-indigo-600 rounded-md hover:bg-indigo-50"><PencilSquareIcon className="w-5 h-5"/></button>
                                        <button onClick={() => handleDeletePackage(pkg.id)} className="p-2 text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50"><TrashIcon className="w-5 h-5"/></button>
                                    </div>
                                </li>
                             ))}
                        </ul>
                    </div>
                </div>
            </div>

            {editingPackage && (
                <PackageEditor 
                    pkg={editingPackage} 
                    allAddons={addons}
                    onClose={() => setEditingPackage(null)}
                    onSave={handleSavePackage}
                    isSubmitting={isSubmitting}
                />
            )}
        </div>
    );
};

// --- Package Editor Component ---
interface PackageEditorProps {
    pkg: Package;
    allAddons: Addon[];
    onClose: () => void;
    onSave: (pkg: Package) => void;
    isSubmitting: boolean;
}

const PackageEditor: FC<PackageEditorProps> = ({ pkg, allAddons, onClose, onSave, isSubmitting }) => {
    const [editedPkg, setEditedPkg] = useState<Package>(pkg);
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setEditedPkg(p => ({ ...p, [name]: name === 'price' ? parseFloat(value) || 0 : value }));
    };

    const handleAddonToggle = (addonId: number) => {
        const isAlreadyIncluded = editedPkg.addons.some(a => a.id === addonId);
        if (isAlreadyIncluded) {
            setEditedPkg(p => ({ ...p, addons: p.addons.filter(a => a.id !== addonId) }));
        } else {
            const addonToAdd = allAddons.find(a => a.id === addonId);
            if (addonToAdd) {
                setEditedPkg(p => ({ ...p, addons: [...p.addons, { ...addonToAdd, is_locked: false }] }));
            }
        }
    };
    
    const handleLockToggle = (addonId: number) => {
        setEditedPkg(p => ({
            ...p,
            addons: p.addons.map(a => a.id === addonId ? { ...a, is_locked: !a.is_locked } : a)
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(editedPkg);
    };

    const includedAddonIds = new Set(editedPkg.addons.map(a => a.id));
    const inputClasses = "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";


    return (
        <Modal onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-6">
                 <h3 className="text-xl font-bold text-slate-800">{pkg.id ? 'Edytuj Pakiet' : 'Nowy Pakiet'}</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <input name="name" value={editedPkg.name} onChange={handleInputChange} placeholder="Nazwa pakietu" className={inputClasses} required />
                     <input name="price" type="number" step="0.01" value={editedPkg.price} onChange={handleInputChange} placeholder="Cena bazowa" className={inputClasses} required />
                </div>
                 <textarea name="description" value={editedPkg.description} onChange={handleInputChange} placeholder="Opis pakietu" className={inputClasses} rows={2}></textarea>

                <div>
                    <h4 className="font-semibold mb-2">Dodatki w pakiecie</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                        {editedPkg.addons.map(addon => (
                            <div key={addon.id} className="flex justify-between items-center p-2 bg-indigo-50 rounded-md">
                               <span>{addon.name}</span>
                               <label className="flex items-center gap-2 text-sm cursor-pointer">
                                   <input type="checkbox" checked={addon.is_locked} onChange={() => handleLockToggle(addon.id)} className="rounded" />
                                   Zablokowany
                               </label>
                            </div>
                        ))}
                         {editedPkg.addons.length === 0 && <p className="text-sm text-slate-400">Brak dodatków w pakiecie.</p>}
                    </div>
                </div>
                 <div>
                    <h4 className="font-semibold mb-2">Wybierz dodatki do dołączenia</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                         {allAddons.map(addon => (
                            <div key={addon.id} className="flex justify-between items-center p-2 rounded-md hover:bg-slate-100">
                               <span>{addon.name} ({formatCurrency(addon.price)})</span>
                                <input type="checkbox" checked={includedAddonIds.has(addon.id)} onChange={() => handleAddonToggle(addon.id)} className="rounded" />
                            </div>
                         ))}
                    </div>
                </div>
                
                <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onClose} disabled={isSubmitting} className="bg-slate-100 text-slate-800 font-bold py-2 px-4 rounded-lg">Anuluj</button>
                    <button type="submit" disabled={isSubmitting} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center w-28">
                        {isSubmitting ? <LoadingSpinner className="w-5 h-5"/> : 'Zapisz'}
                    </button>
                </div>
            </form>
        </Modal>
    )
};

export default AdminPackagesPage;
