import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { apiFetch } from '@/nucleo/api';
import { mensagemDeErro } from '@/nucleo/apresentacao';

/**
 * Sem rede: leitura tenta, ação recusa na hora.
 *
 * É metade do fluxo 02 do plano — *"sem sinal → escala carregada visível → tentar ação →
 * recusa clara"*. A outra metade (a escala continuar visível) é o cache do TanStack Query,
 * que já existia. A recusa não existia: a ação era disparada, o `fetch` estourava por conta
 * própria depois de alguns segundos, e a pessoa via erro genérico sem saber se o pedido tinha
 * saído.
 *
 * A distinção entre ler e escrever é o coração do caso, e é onde um erro seria caro nos dois
 * sentidos: bloquear leitura mataria a promessa do cache; deixar escrita passar traria de
 * volta a espera e a dúvida.
 */

/**
 * Um `fetch` que registra se chegou a ser chamado. Nenhum teste aqui quer rede de verdade.
 *
 * A assinatura é declarada porque `@jest/globals` tipa `jest.fn()` estritamente: sem ela,
 * `mockResolvedValue` não aceita nada. Só os três campos que `apiFetch` lê são fornecidos.
 */
type RespostaFalsa = { ok: boolean; status: number; json: () => Promise<unknown> };

const chamouFetch = jest.fn<(...args: unknown[]) => Promise<RespostaFalsa>>();
const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  chamouFetch.mockReset();
  chamouFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: 'ok' }),
  });
  globalThis.fetch = chamouFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  onlineManager.setOnline(true);
});

describe('offline', () => {
  beforeEach(() => onlineManager.setOnline(false));

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    '%s é recusado sem sequer tentar a rede',
    async (metodo) => {
      await expect(apiFetch('/requests', { method: metodo })).rejects.toThrow(/sem conexão/i);
      expect(chamouFetch).not.toHaveBeenCalled();
    },
  );

  /**
   * A recusa precisa dizer o que houve. Um erro genérico aqui seria pior que o comportamento
   * antigo: rápido, mas igualmente confuso.
   */
  it('a mensagem diz que falta conexão e que dá para tentar de novo', async () => {
    const erro = await apiFetch('/requests', { method: 'POST' }).catch((e) => e);
    const msg = mensagemDeErro(erro);

    expect(msg.tipo).toBe('rede');
    expect(msg.podeTentarDeNovo).toBe(true);
  });

  /**
   * Leitura NÃO é recusada, e essa é a metade que sustenta a promessa do produto: o que já
   * está em cache continua aparecendo, e uma tentativa a mais custa nada.
   */
  it('GET continua sendo tentado, porque o cache depende disso', async () => {
    await expect(apiFetch('/users/me/dashboard')).resolves.toBeDefined();
    expect(chamouFetch).toHaveBeenCalled();
  });

  it('requisição sem método declarado conta como leitura', async () => {
    await apiFetch('/users/me/dashboard', { headers: {} });
    expect(chamouFetch).toHaveBeenCalled();
  });

  /** Método em minúsculas é a mesma escrita — a comparação não pode depender de caixa. */
  it('o método é comparado sem caixa', async () => {
    await expect(apiFetch('/requests', { method: 'post' })).rejects.toThrow(/sem conexão/i);
    expect(chamouFetch).not.toHaveBeenCalled();
  });
});

describe('online', () => {
  beforeEach(() => onlineManager.setOnline(true));

  it('escrita passa normalmente', async () => {
    await expect(apiFetch('/requests', { method: 'POST' })).resolves.toBeDefined();
    expect(chamouFetch).toHaveBeenCalled();
  });
});
