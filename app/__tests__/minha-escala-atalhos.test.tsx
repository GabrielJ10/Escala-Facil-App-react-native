import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { AtalhosDoFuncionario } from '../minha-escala';
import { usePodeVer } from '@/nucleo/sessao';

/**
 * Os atalhos do funcionário só aparecem quando a capacidade existe.
 *
 * Achado de auditoria: Trocas e Afastamentos eram renderizados incondicionalmente, enquanto
 * toda tela de gestor já passava por `usePodeVer`. A consequência não era teórica —
 * `module_shift_requests` é `plans: ['PRO']` mais o recurso `enable_shift_swaps`
 * (`system.config.js:328`), então num tenant BASIC o funcionário via o botão e tomava
 * "Sem acesso" toda vez que tocasse. O site já travava o mesmo item.
 *
 * A capacidade vem do servidor, via `/auth/me`, e nunca de papel ou plano conferido na tela:
 * papel e plano mudam de significado com o tempo, a capacidade é a resposta do servidor à
 * pergunta que estamos fazendo.
 */
jest.mock('@/nucleo/sessao', () => ({ usePodeVer: jest.fn() }));

const capacidades = (concedidas: string[]) => {
  jest.mocked(usePodeVer).mockImplementation((cap: string) => concedidas.includes(cap));
};

const rotulos = () => screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);

describe('atalhos do funcionário', () => {
  it('com as duas capacidades, mostra os quatro atalhos', async () => {
    capacidades(['module_shift_requests', 'action_create_absence_request']);
    await render(<AtalhosDoFuncionario />);

    expect(screen.getByText('Trocas')).toBeTruthy();
    expect(screen.getByText('Afastamentos')).toBeTruthy();
  });

  /**
   * O caso do tenant BASIC, que é o que a auditoria encontrou em produção.
   */
  it('sem module_shift_requests, o botão Trocas não existe', async () => {
    capacidades(['action_create_absence_request']);
    await render(<AtalhosDoFuncionario />);

    expect(screen.queryByText('Trocas')).toBeNull();
    expect(screen.getByText('Afastamentos')).toBeTruthy();
  });

  it('sem a capacidade de afastamento, o botão some do mesmo jeito', async () => {
    capacidades(['module_shift_requests']);
    await render(<AtalhosDoFuncionario />);

    expect(screen.getByText('Trocas')).toBeTruthy();
    expect(screen.queryByText('Afastamentos')).toBeNull();
  });

  /**
   * Avisos e Perfil não perguntam nada, e isso é decisão: notificação e dados da própria
   * conta valem para qualquer plano e qualquer papel. Sem este caso, alguém poderia "consertar"
   * travando os quatro e deixar o funcionário sem saída nenhuma.
   */
  it('Avisos e Perfil aparecem mesmo sem capacidade alguma', async () => {
    capacidades([]);
    await render(<AtalhosDoFuncionario />);

    expect(screen.getByText('Avisos')).toBeTruthy();
    expect(screen.getByText('Perfil')).toBeTruthy();
    expect(rotulos().length).toBe(2);
  });
});
