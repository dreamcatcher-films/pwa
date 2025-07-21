
export const formatCurrency = (value: number | string): string => {
    const numericValue = Number(value);
    if (isNaN(numericValue)) {
        return '';
    }
    return numericValue.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });
};

export const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy text: ', err);
    });
};
