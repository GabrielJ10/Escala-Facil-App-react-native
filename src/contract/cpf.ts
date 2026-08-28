export function normalizeCpf(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export function validateCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split('').map((char) => Number(char));

  const firstSum = digits
    .slice(0, 9)
    .reduce((acc, digit, idx) => acc + (digit * (10 - idx)), 0);
  const firstRemainder = firstSum % 11;
  const firstVerifier = firstRemainder < 2 ? 0 : 11 - firstRemainder;

  const secondSum = digits
    .slice(0, 10)
    .reduce((acc, digit, idx) => acc + (digit * (11 - idx)), 0);
  const secondRemainder = secondSum % 11;
  const secondVerifier = secondRemainder < 2 ? 0 : 11 - secondRemainder;

  return digits[9] === firstVerifier && digits[10] === secondVerifier;
}

export function formatCpfInput(value: string): string {
  const digits = normalizeCpf(value).slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
