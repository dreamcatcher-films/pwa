export const formatCurrency = (value: number): string => {
    if (isNaN(value)) {
        return '';
    }
    return value.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });
};

export const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy text: ', err);
    });
};
