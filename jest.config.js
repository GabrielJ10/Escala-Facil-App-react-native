/**
 * Jest, e só para teste de tela.
 *
 * Este repositório tem dois runners de propósito, e a divisão é por extensão:
 *
 *   - **`.test.ts` → Vitest.** É onde vivem os testes do contrato, copiados byte a byte do
 *     site e conferidos por `check:contract`. Se rodassem em Jest, as fontes ficariam
 *     idênticas e os testes bifurcariam em silêncio — exatamente o que o verificador existe
 *     para impedir.
 *
 *   - **`.test.tsx` → Jest, aqui.** Renderizar componente React Native fora do `jest-expo`
 *     não é caminho suportado: a documentação do SDK 57 indica `jest-expo` mais
 *     `@testing-library/react-native`, e o preset é quem simula a parte nativa do SDK. Sem
 *     ele, importar uma tela quebra no primeiro módulo nativo que ela toca.
 *
 * Não há bifurcação de contrato nisso: teste de tela é do aplicativo por natureza — o site
 * tem as telas dele, escritas em DOM, e não há nada para manter idêntico.
 */
module.exports = {
  preset: 'jest-expo',

  // Só `.tsx`. O `.ts` é território do Vitest, e sobrepor os dois faria cada teste do
  // contrato rodar duas vezes, com dois resultados possíveis para a mesma verdade.
  testMatch: ['**/__tests__/**/*.test.tsx', '**/*.test.tsx'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/dist/'],
};
