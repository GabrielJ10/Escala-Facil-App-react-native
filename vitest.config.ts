import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Mesmo runner do site — de propósito.
 *
 * Os testes do contrato são copiados byte a byte do site e verificados por
 * `check:contract`. Se aqui rodasse Jest, as fontes ficariam idênticas e os testes
 * bifurcariam em silêncio, que é exatamente o que o verificador existe para impedir.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
