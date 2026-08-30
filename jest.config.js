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

  // Duas famílias, e as duas pelo mesmo motivo: precisam do runtime do aplicativo.
  //
  //   - `.test.tsx` — telas, que renderizam componentes React Native.
  //   - `__testes-nativos__/*.test.ts` — módulos que não são telas mas alcançam `react-native`
  //     ou `expo-*`. `api.ts` é o caso: as regras dele são puras, mas ele importa
  //     `expo-constants` por baixo, e o Vitest não consegue carregar isso.
  //
  // O Vitest exclui a mesma pasta, então nenhum arquivo roda duas vezes.
  testMatch: ['**/*.test.tsx', '**/__testes-nativos__/**/*.test.ts'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/dist/'],
};
