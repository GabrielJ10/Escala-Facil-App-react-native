import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import Indisponivel from '../indisponivel';

/**
 * A tela neutra de bloqueio — e o que ela **não** pode conter.
 *
 * É o teste de tela mais valioso deste aplicativo, e o motivo não é técnico. A regra 3.1.3(f)
 * da Apple permite que um app corporativo entregue conteúdo comprado fora, desde que não
 * venda nem direcione para venda dentro do app. Esta tela é para onde vai todo destino de
 * cobrança — os oito `target_path` do backend que apontam para billing. Um único botão
 * "renovar assinatura" aqui transforma o app em vitrine e reprova a submissão.
 *
 * O custo de descobrir isso pela Apple é uma rodada de revisão, que leva dias. O custo de
 * descobrir aqui é um teste vermelho.
 *
 * Por isso as asserções são pelo negativo: em vez de fixar o texto atual — que pode ser
 * reescrito sem problema —, elas varrem tudo que a tela renderiza atrás dos sinais de venda.
 * Assim o teste sobrevive a uma mudança de redação e continua pegando a mudança que importa.
 */
describe('Indisponível — a tela que não pode vender nada', () => {
  /**
   * Todo texto que a tela põe na frente do usuário, em minúsculas.
   *
   * Percorre a árvore renderizada em vez de consultar por papel: o que importa aqui é o que
   * a pessoa lê, venha de onde vier — título, parágrafo, rótulo de botão ou legenda.
   */
  function textoRenderizado() {
    const pedacos: string[] = [];

    const percorrer = (no: unknown): void => {
      if (typeof no === 'string' || typeof no === 'number') {
        pedacos.push(String(no));
        return;
      }
      if (Array.isArray(no)) {
        no.forEach(percorrer);
        return;
      }
      if (no && typeof no === 'object' && 'children' in no) {
        percorrer((no as { children: unknown }).children);
      }
    };

    percorrer(screen.toJSON());
    return pedacos.join(' ').toLowerCase();
  }

  it('explica a situação sem citar preço, plano ou pagamento', async () => {
    await render(<Indisponivel />);
    const texto = textoRenderizado();

    // A tela precisa dizer alguma coisa — um teste que só verifica ausências passaria numa
    // tela em branco.
    expect(texto).toContain('indisponível');
    expect(screen.getByText(/fale com o gestor/i)).toBeTruthy();

    for (const proibido of [
      'r$', 'reais', 'preço', 'preco', 'valor', 'mensalidade',
      'assinar', 'assinatura', 'renovar', 'pagar', 'pagamento', 'cartão', 'cartao',
      'plano', 'pro', 'upgrade', 'comprar', 'checkout', 'desconto', 'oferta',
    ]) {
      expect(texto).not.toContain(proibido);
    }
  });

  /**
   * Link para fora é a outra forma de "direcionar para venda", e a que passa despercebida:
   * um `Linking.openURL` para o site de pagamento não aparece como botão de compra, mas é
   * a mesma coisa aos olhos da revisão.
   */
  it('não oferece caminho para fora do aplicativo', async () => {
    await render(<Indisponivel />);

    const serializado = JSON.stringify(screen.toJSON());
    expect(serializado).not.toMatch(/https?:\/\//i);
    expect(serializado.toLowerCase()).not.toContain('escalafacil.app.br');
  });

  /**
   * A promessa que a tela faz ao funcionário: o que já carregou continua visível. É o que
   * separa "bloqueado" de "quebrado" para quem não é quem paga e não tem como resolver.
   */
  it('avisa que os turnos já carregados continuam visíveis', async () => {
    await render(<Indisponivel />);

    expect(screen.getByText(/continuam visíveis/i)).toBeTruthy();
  });

  it('o único botão é voltar, e ele é alcançável por leitor de tela', async () => {
    await render(<Indisponivel />);

    const botoes = screen.getAllByRole('button');
    expect(botoes).toHaveLength(1);
    expect(screen.getByLabelText('Voltar')).toBeTruthy();
  });

  it('voltar usa o histórico quando há para onde voltar', async () => {
    await render(<Indisponivel />);
    await fireEvent.press(screen.getByLabelText('Voltar'));

    expect(router.back).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  /**
   * Sem histórico — o caso de quem chegou aqui por notificação, com o app fechado — voltar
   * não pode virar tela morta. Cai na escala, que é a tela inicial do funcionário.
   */
  it('sem histórico, voltar leva para a escala em vez de não fazer nada', async () => {
    jest.mocked(router.canGoBack).mockReturnValue(false);
    await render(<Indisponivel />);

    await fireEvent.press(screen.getByLabelText('Voltar'));

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/minha-escala');
  });
});
