export const APP_CURRENCY = process.env.APP_CURRENCY ?? 'CHF';

const formatter = new Intl.NumberFormat('de-CH', {
  style: 'currency',
  currency: APP_CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '–';
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (Number.isNaN(value)) return '–';
  return formatter.format(value);
}
