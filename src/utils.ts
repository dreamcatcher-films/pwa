export const formatCurrency = (value: number): string => {
    if (isNaN(value)) {
        return '';
    }
    return value.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });
};
