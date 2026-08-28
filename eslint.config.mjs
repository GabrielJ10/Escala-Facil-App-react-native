import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

/**
 * O linter que faltava neste repositório.
 *
 * O backend tem ESLint com SonarJS, o site tem ESLint com as regras de hook. Este repo não
 * tinha nada — e é o que mais precisa das duas coisas: quase toda tela aqui é uma composição
 * de hooks, e um array de dependências errado num app não vira aviso no console de ninguém.
 * Vira bateria consumida em segundo plano, ou uma tela que não atualiza e ninguém reproduz.
 *
 * As escolhas que não são as padrão, e por quê:
 *
 * - **`react-hooks` em `error`, não `warn`.** No site elas são aviso e conviveram seis meses
 *   com seis pendências, uma das quais fazia um efeito rodar em todo render. Aqui começam
 *   como erro justamente porque ainda não há dívida para acomodar.
 *
 * - **`sonarjs` na versão enxuta.** A lista completa do SonarWay acusa 179 achados no
 *   backend, a maioria em código que funciona. Aqui entram só as regras que apontam defeito
 *   de verdade — condição duplicada, retorno invariante, exceção engolida — e a de
 *   complexidade cognitiva, que é o mesmo teto de 15 usado no backend.
 *
 * - **`no-explicit-any` em `error`.** O site acumulou 56 antes de alguém olhar, e cada um
 *   escondia um campo que ninguém tipou. Começar com zero é mais barato que tipar depois.
 */
export default tseslint.config(
  {
    ignores: ['.expo/**', 'dist/**', 'node_modules/**', 'maestro/**'],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.es2021,
        // React Native roda sobre um runtime que tem console, fetch e timers, mas não é o
        // navegador: não existe `window`, `document` nem `localStorage`. Declarar `browser`
        // aqui esconderia justamente o erro que só aparece no aparelho.
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        __DEV__: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      sonarjs,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',

      '@typescript-eslint/no-explicit-any': 'error',
      // O `_` na frente é a forma de dizer "recebo e ignoro de propósito".
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-element-overwrite': 'error',
      'sonarjs/no-invariant-returns': 'error',
      'sonarjs/no-ignored-exceptions': 'error',
      'sonarjs/no-redundant-jump': 'error',
      'sonarjs/prefer-immediate-return': 'error',
    },
  },
  {
    // Teste repete de propósito: um caso que reaproveita a montagem do outro esconde o que
    // ele está exercitando, e o teto de complexidade não faz sentido numa tabela de casos.
    files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
    rules: {
      'sonarjs/no-identical-functions': 'off',
      'sonarjs/cognitive-complexity': 'off',
    },
  },
);
