import React, { FC, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, SubmitHandler } from 'react-hook-form';
import { 
    getQuestionnaireTemplates, createQuestionnaireTemplate, updateQuestionnaireTemplate, deleteQuestionnaireTemplate,
    addQuestion, updateQuestion, deleteQuestion
} from '../api';
import { LoadingSpinner, PlusCircleIcon, TrashIcon, PencilSquareIcon, XMarkIcon, CheckCircleIcon, QuestionMarkCircleIcon } from '../components/Icons';

// --- TYPES ---
interface Question {
    id: number;
    text: string;
    type: 'text' | 'yes_no' | 'link';
    sort_order: number;
}
interface QuestionnaireTemplate {
    id: number;
    title: string;
    is_default: boolean;
    questions: Question[];
}
type TemplateFormValues = { title: string; is_default: boolean; };
type QuestionFormValues = { text: string; type: 'text' | 'yes_no' | 'link'; };

const inputClasses = "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";

// --- EDITOR MODALS ---
const TemplateEditorModal: FC<{ template?: QuestionnaireTemplate; onClose: () => void; }> = ({ template, onClose }) => {
    const queryClient = useQueryClient();
    const { register, handleSubmit } = useForm<TemplateFormValues>({ defaultValues: { title: template?.title || '', is_default: template?.is_default || false }});
    
    const mutation = useMutation({
        mutationFn: (data: TemplateFormValues) => template?.id ? updateQuestionnaireTemplate({ id: template.id, data }) : createQuestionnaireTemplate(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['questionnaireTemplates'] });
            onClose();
        }
    });

    const onSubmit: SubmitHandler<TemplateFormValues> = data => mutation.mutate(data);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg relative animate-modal-in">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><XMarkIcon /></button>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <h3 className="text-xl font-bold text-slate-800">{template?.id ? 'Edytuj Szablon Ankiety' : 'Nowy Szablon Ankiety'}</h3>
                    {mutation.isError && <p className="text-red-500 text-sm">{mutation.error.message}</p>}
                    <input {...register('title', { required: true })} placeholder="Tytuł ankiety" className={inputClasses} />
                    <label className="flex items-center gap-2"><input type="checkbox" {...register('is_default')} className="rounded" /> Ustaw jako domyślną</label>
                    <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={onClose} disabled={mutation.isPending} className="bg-slate-100 font-bold py-2 px-4 rounded-lg">Anuluj</button><button type="submit" disabled={mutation.isPending} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg w-28 flex justify-center">{mutation.isPending ? <LoadingSpinner/> : 'Zapisz'}</button></div>
                </form>
            </div>
        </div>
    );
};

const QuestionEditorModal: FC<{ question?: Question; templateId: number; onClose: () => void; }> = ({ question, templateId, onClose }) => {
    const queryClient = useQueryClient();
    const { register, handleSubmit } = useForm<QuestionFormValues>({ defaultValues: { text: question?.text || '', type: question?.type || 'text' }});
    
    const mutation = useMutation({
        mutationFn: (data: QuestionFormValues) => question?.id ? updateQuestion({ questionId: question.id, data }) : addQuestion({ templateId, data }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['questionnaireTemplates'] });
            onClose();
        }
    });
    
    const onSubmit: SubmitHandler<QuestionFormValues> = data => mutation.mutate(data);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg relative animate-modal-in">
                 <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><XMarkIcon /></button>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <h3 className="text-xl font-bold text-slate-800">{question?.id ? 'Edytuj Pytanie' : 'Nowe Pytanie'}</h3>
                    {mutation.isError && <p className="text-red-500 text-sm">{mutation.error.message}</p>}
                    <textarea {...register('text', { required: true })} placeholder="Treść pytania" rows={3} className={inputClasses} />
                    <select {...register('type')} className={inputClasses}>
                        <option value="text">Pytanie otwarte</option>
                        <option value="yes_no">Tak / Nie</option>
                        <option value="link">Link (np. do Pinteresta)</option>
                    </select>
                     <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={onClose} disabled={mutation.isPending} className="bg-slate-100 font-bold py-2 px-4 rounded-lg">Anuluj</button><button type="submit" disabled={mutation.isPending} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg w-28 flex justify-center">{mutation.isPending ? <LoadingSpinner/> : 'Zapisz'}</button></div>
                </form>
            </div>
        </div>
    );
};


// --- MAIN PAGE ---
const AdminQuestionnairesPage: FC = () => {
    const [editingTemplate, setEditingTemplate] = useState<QuestionnaireTemplate | null>(null);
    const [editingQuestion, setEditingQuestion] = useState<{ question?: Question; templateId: number } | null>(null);
    const queryClient = useQueryClient();

    const { data: templates, isLoading, error } = useQuery<QuestionnaireTemplate[], Error>({ 
        queryKey: ['questionnaireTemplates'], 
        queryFn: getQuestionnaireTemplates 
    });

    const deleteTemplateMutation = useMutation({
        mutationFn: deleteQuestionnaireTemplate,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['questionnaireTemplates'] }),
    });
    const deleteQuestionMutation = useMutation({
        mutationFn: deleteQuestion,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['questionnaireTemplates'] }),
    });
    
    if (isLoading) return <div className="flex justify-center items-center py-20"><LoadingSpinner className="w-12 h-12 text-indigo-600" /></div>;
    if (error) return <p className="text-red-500 bg-red-50 p-3 rounded-lg text-center">{error.message}</p>;

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-800">Szablony Ankiet</h2>
                <button onClick={() => setEditingTemplate({} as QuestionnaireTemplate)} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                    <PlusCircleIcon className="w-5 h-5"/> Nowy Szablon
                </button>
            </div>

            <div className="space-y-6">
                {templates?.map(template => (
                    <details key={template.id} className="bg-white rounded-2xl shadow p-4" open>
                        <summary className="font-bold text-lg cursor-pointer flex justify-between items-center">
                            <div>
                                {template.title}
                                {template.is_default && <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-1 rounded-full ml-3">Domyślna</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.preventDefault(); setEditingTemplate(template); }} className="p-2 text-slate-500 hover:text-indigo-600"><PencilSquareIcon/></button>
                                <button onClick={(e) => { e.preventDefault(); if(window.confirm('Na pewno?')) deleteTemplateMutation.mutate(template.id); }} className="p-2 text-slate-500 hover:text-red-600"><TrashIcon/></button>
                            </div>
                        </summary>
                        <div className="mt-4 pt-4 border-t">
                            <ul className="space-y-2">
                                {template.questions.map(q => (
                                    <li key={q.id} className="flex justify-between items-center p-2 bg-slate-50 rounded-md">
                                        <div><p className="font-medium text-sm">{q.text}</p><p className="text-xs text-slate-500 uppercase">{q.type.replace('_', ' ')}</p></div>
                                        <div><button onClick={() => setEditingQuestion({ question: q, templateId: template.id })} className="p-1 text-slate-400 hover:text-indigo-500"><PencilSquareIcon className="w-4 h-4"/></button><button onClick={() => deleteQuestionMutation.mutate(q.id)} className="p-1 text-slate-400 hover:text-red-500"><TrashIcon className="w-4 h-4"/></button></div>
                                    </li>
                                ))}
                            </ul>
                            <button onClick={() => setEditingQuestion({ templateId: template.id })} className="mt-4 text-sm text-indigo-600 font-semibold flex items-center gap-1"><PlusCircleIcon className="w-4 h-4"/> Dodaj pytanie</button>
                        </div>
                    </details>
                ))}
            </div>

            {editingTemplate && <TemplateEditorModal template={editingTemplate} onClose={() => setEditingTemplate(null)} />}
            {editingQuestion && <QuestionEditorModal question={editingQuestion.question} templateId={editingQuestion.templateId} onClose={() => setEditingQuestion(null)} />}
        </div>
    );
};

export default AdminQuestionnairesPage;
