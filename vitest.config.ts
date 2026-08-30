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
    // Só `.ts`: teste de tela é `.tsx` e roda no Jest, com o preset `jest-expo` — que é o
    // caminho que a documentação do SDK 57 indica e o único que simula a parte nativa. A
    // divisão por extensão evita os dois runners colidirem no mesmo arquivo.
    include: ['src/**/*.{test,spec}.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
