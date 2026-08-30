/**
 * O que toda tela precisa para renderizar fora do aparelho.
 *
 * Duas coisas, e as duas pelo mesmo motivo: são módulos nativos que existem no celular e não
 * no Node. O `jest-expo` simula a maior parte do SDK, mas navegação e armazenamento seguro
 * são específicos o bastante para o teste querer controlar.
 */

/**
 * O `expo-router` é substituído por um duplo observável, e não silenciado.
 *
 * Navegar é comportamento: "esta tela leva para aquela" é exatamente o tipo de coisa que
 * quebra sem ninguém ver. Com o duplo, o teste afirma o destino.
 *
 * O teste alcança este duplo importando `expo-router` normalmente — o módulo já está
 * substituído — e não por um global. Um global a menos, e o tipo vem de graça.
 */
// O prefixo `mock` não é estilo: a fábrica de `jest.mock` é içada para antes das
// declarações, e o Jest só permite que ela alcance variáveis com esse prefixo.
const mockNavegacao = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  setParams: jest.fn(),
  dismissAll: jest.fn(),
};

jest.mock('expo-router', () => ({
  router: mockNavegacao,
  useRouter: () => mockNavegacao,
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  usePathname: () => '/',
  Link: 'Link',
  Stack: Object.assign('Stack', { Screen: 'Stack.Screen' }),
  Redirect: 'Redirect',
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

beforeEach(() => {
  for (const fn of Object.values(mockNavegacao)) {
    if (typeof fn.mockClear === 'function') fn.mockClear();
  }
  mockNavegacao.canGoBack.mockReturnValue(true);
});
