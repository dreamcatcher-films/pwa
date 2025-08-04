import React, { FC, useState, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { saveQuestionnaireAnswers, submitQuestionnaire } from '../../api';
import { debounce } from 'lodash';
import { LoadingSpinner, CheckCircleIcon, QuestionMarkCircleIcon } from '../Icons';

interface Question {
    id: number;
    text: string;
    type: 'text' | 'yes_no' | 'link';
}
interface QuestionnaireData {
    response_id: number;
    status: 'pending' | 'submitted';
    template: { title: string };
    questions: Question[];
    answers: Record<string, string>;
}

const Questionnaire: FC<{ questionnaire: QuestionnaireData | null }> = ({ questionnaire }) => {
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    const saveMutation = useMutation({ mutationFn: saveQuestionnaireAnswers });
    const submitMutation = useMutation({ mutationFn: submitQuestionnaire });

    useEffect(() => {
        if (questionnaire) {
            setAnswers(questionnaire.answers || {});
        }
    }, [questionnaire]);

    const debouncedSave = useCallback(
        debounce((newAnswers: Record<string, string>) => {
            if (questionnaire?.response_id) {
                setSaveStatus('saving');
                saveMutation.mutate(
                    { response_id: questionnaire.response_id, answers: newAnswers },
                    { onSuccess: () => setSaveStatus('saved'), onError: () => setSaveStatus('idle') }
                );
            }
        }, 1500),
        [questionnaire?.response_id]
    );

    const handleAnswerChange = (questionId: number, value: string) => {
        const newAnswers = { ...answers, [questionId]: value };
        setAnswers(newAnswers);
        setSaveStatus('idle'); // Reset status to show changes are not yet saved
        debouncedSave(newAnswers);
    };

    const handleSubmit = () => {
        if (questionnaire && window.confirm('Czy na pewno chcesz zatwierdzić i wysłać ankietę? Po wysłaniu nie będzie można jej edytować.')) {
            submitMutation.mutate(questionnaire.response_id);
        }
    };
    
    if (!questionnaire) {
        return <div className="bg-white rounded-2xl shadow p-6 text-center text-slate-500">Ankieta nie została jeszcze przypisana.</div>;
    }

    const isSubmitted = questionnaire.status === 'submitted' || submitMutation.isSuccess;

    return (
        <div className="bg-white rounded-2xl shadow p-6">
            <div className="flex justify-between items-start mb-4 pb-4 border-b">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">{questionnaire.template.title}</h2>
                    <p className="text-sm text-slate-500">Prosimy o wypełnienie poniższych pól. Wasze odpowiedzi pomogą nam lepiej przygotować się do Waszego dnia.</p>
                </div>
                {saveStatus !== 'idle' && !isSubmitted && (
                    <div className="text-sm text-slate-500 flex items-center gap-2">
                        {saveStatus === 'saving' && <><LoadingSpinner className="w-4 h-4" /> Zapisywanie...</>}
                        {saveStatus === 'saved' && <><CheckCircleIcon className="w-4 h-4 text-green-500"/> Zapisano</>}
                    </div>
                )}
            </div>

            {isSubmitted && (
                 <div className="p-4 mb-6 bg-green-50 border-l-4 border-green-500 text-green-700">
                    <p className="font-bold">Ankieta została wysłana. Dziękujemy!</p>
                </div>
            )}

            <div className="space-y-6">
                {questionnaire.questions.map(q => (
                    <div key={q.id}>
                        <label className="block text-md font-semibold text-slate-800 mb-2">{q.text}</label>
                        {q.type === 'text' && (
                            <textarea
                                value={answers[q.id] || ''}
                                onChange={e => handleAnswerChange(q.id, e.target.value)}
                                rows={4}
                                className="w-full rounded-md border-slate-300"
                                readOnly={isSubmitted}
                            />
                        )}
                        {q.type === 'yes_no' && (
                            <div className="flex gap-4">
                                <label className="flex items-center"><input type="radio" name={`q_${q.id}`} value="Tak" checked={answers[q.id] === 'Tak'} onChange={e => handleAnswerChange(q.id, e.target.value)} disabled={isSubmitted} className="mr-2"/> Tak</label>
                                <label className="flex items-center"><input type="radio" name={`q_${q.id}`} value="Nie" checked={answers[q.id] === 'Nie'} onChange={e => handleAnswerChange(q.id, e.target.value)} disabled={isSubmitted} className="mr-2"/> Nie</label>
                            </div>
                        )}
                        {q.type === 'link' && (
                            <input
                                type="url"
                                value={answers[q.id] || ''}
                                onChange={e => handleAnswerChange(q.id, e.target.value)}
                                placeholder="https://pinterest.com/..."
                                className="w-full rounded-md border-slate-300"
                                readOnly={isSubmitted}
                            />
                        )}
                    </div>
                ))}
            </div>

            {!isSubmitted && (
                <div className="mt-8 pt-6 border-t flex justify-end">
                    <button onClick={handleSubmit} disabled={submitMutation.isPending} className="bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 flex items-center justify-center w-48">
                        {submitMutation.isPending ? <LoadingSpinner/> : 'Zatwierdź i wyślij'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default Questionnaire;
