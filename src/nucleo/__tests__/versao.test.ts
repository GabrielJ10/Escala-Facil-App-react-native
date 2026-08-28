/**
 * O portão de versão.
 *
 * Duas coisas podem dar errado aqui, e as duas são caras:
 *
 *   - **comparar como texto**: em texto "0.10.0" < "0.9.0", e o app bloquearia exatamente
 *     quem já atualizou. É o erro clássico, e não aparece até a versão passar do 9.
 *   - **falhar fechado**: um portão que tranca porque não conseguiu perguntar se pode
 *     destravar deixa o app inutilizável durante qualquer queda da API.
 */
import { describe, expect, it } from 'vitest';

import { avaliarVersao, compararVersoes } from '@/nucleo/versao';

describe('compararVersoes', () => {
  it('compara por componente, não como texto', () => {
    // Se isto falhar, alguém trocou por comparação de strings.
    expect(compararVersoes('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compararVersoes('1.0.0', '0.99.99')).toBeGreaterThan(0);
    expect(compararVersoes('2.0.0', '10.0.0')).toBeLessThan(0);
  });

  it('versões iguais dão zero', () => {
    expect(compararVersoes('1.2.3', '1.2.3')).toBe(0);
  });

  it('componente ausente vale zero: 1.2 é 1.2.0', () => {
    expect(compararVersoes('1.2', '1.2.0')).toBe(0);
    expect(compararVersoes('1', '1.0.0')).toBe(0);
  });

  it('ignora sufixo de pré-lançamento em vez de quebrar', () => {
    // "1.2.3-beta.1" é o que o EAS gera em canal de teste; virar NaN aqui bloquearia todo o
    // TestFlight.
    expect(compararVersoes('1.2.3-beta.1', '1.2.3')).toBe(0);
  });

  it('lixo é tratado como 0.0.0, não como NaN', () => {
    expect(compararVersoes('', '0.0.0')).toBe(0);
    expect(compararVersoes('abc', '0.0.1')).toBeLessThan(0);
  });
});

describe('avaliarVersao', () => {
  const portao = {
    minimum: '1.0.0',
    recommended: '1.2.0',
    message: 'Atualize',
    enforced: true,
    store_url: { ios: null, android: null },
  };

  it('abaixo do mínimo bloqueia', () => {
    expect(avaliarVersao('0.9.0', portao)).toBe('bloqueado');
  });

  it('entre o mínimo e o recomendado só sugere', () => {
    expect(avaliarVersao('1.1.0', portao)).toBe('atualizacao-sugerida');
  });

  it('exatamente o mínimo não bloqueia', () => {
    expect(avaliarVersao('1.0.0', portao)).toBe('atualizacao-sugerida');
  });

  it('no recomendado ou acima está ok', () => {
    expect(avaliarVersao('1.2.0', portao)).toBe('ok');
    expect(avaliarVersao('2.0.0', portao)).toBe('ok');
  });

  /**
   * A válvula de escape: desligar o bloqueio por variável de ambiente, sem redeploy do app,
   * se ele se mostrar agressivo demais em produção. Vira sugestão — nunca silêncio.
   */
  it('com enforced falso, o bloqueio vira sugestão', () => {
    expect(avaliarVersao('0.9.0', { ...portao, enforced: false })).toBe('atualizacao-sugerida');
  });

  it('sem portão, nada acontece', () => {
    expect(avaliarVersao('0.0.1', null)).toBe('ok');
    expect(avaliarVersao('0.0.1', undefined)).toBe('ok');
  });

  /**
   * Falha aberto.
   *
   * Se o servidor mudar o formato da resposta, ou devolver campos vazios, o app não pode
   * travar. Ficar sem atualizar é ruim; ficar sem app é pior.
   */
  it('portão com campos ilegíveis não bloqueia ninguém', () => {
    expect(avaliarVersao('0.0.1', {} as never)).toBe('ok');
    expect(avaliarVersao('0.0.1', { minimum: null, recommended: null } as never)).toBe('ok');
    expect(avaliarVersao('0.0.1', { minimum: '', recommended: '' })).toBe('ok');
  });

  it('só recomendado definido: sugere, nunca bloqueia', () => {
    expect(avaliarVersao('1.0.0', { recommended: '1.5.0' })).toBe('atualizacao-sugerida');
  });
});
