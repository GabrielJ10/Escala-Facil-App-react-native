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
    // O Vitest roda o que é PURO. O que precisa do runtime do aplicativo — telas, e módulos
    // que alcancem `react-native` ou `expo-*` — fica no Jest com o preset `jest-expo`, que é
    // quem simula a parte nativa. Ver jest.config.js.
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/__testes-nativos__/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
