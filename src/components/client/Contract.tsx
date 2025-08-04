import React, { FC } from 'react';
import { DocumentTextIcon } from '../Icons';

interface ContractProps {
    contractUrl: string | null;
}

const Contract: FC<ContractProps> = ({ contractUrl }) => {
    return (
        <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4 pb-4 border-b">Twoja Umowa</h2>
            {contractUrl ? (
                <div>
                    <div className="mb-6">
                        <a 
                            href={contractUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700"
                        >
                           <DocumentTextIcon className="w-5 h-5"/>
                            Pobierz umowę (PDF)
                        </a>
                    </div>
                    <div className="aspect-[4/5] sm:aspect-video lg:aspect-[4/3] w-full bg-slate-100 rounded-lg overflow-hidden">
                         <iframe
                            src={contractUrl}
                            title="Podgląd umowy"
                            className="w-full h-full border-0"
                        />
                    </div>
                </div>
            ) : (
                <div className="text-center py-10 text-slate-500">
                    <DocumentTextIcon className="w-12 h-12 mx-auto text-slate-300 mb-4"/>
                    <p className="font-semibold">Umowa nie została jeszcze załączona.</p>
                    <p className="text-sm">Gdy tylko dokument będzie gotowy, pojawi się w tym miejscu.</p>
                </div>
            )}
        </div>
    );
};

export default Contract;
