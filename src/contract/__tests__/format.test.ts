/**
 * Formatação compartilhada — o contrato visual entre site e aplicativo.
 *
 * Estes testes rodam nos dois lados. No site passam sempre, porque o navegador tem ICU
 * completo. No aplicativo, são eles que provam que o polyfill está carregado: sem ele,
 * `pt-BR` cai para `en-US` em silêncio e a data vira "3/16/2026" sem nada quebrar.
 *
 * É o Portão B do plano do aplicativo — a verificação por hash prova que os arquivos são
 * idênticos, mas não que se comportam igual.
 */
import { describe, expect, it } from 'vitest';
import {
  formatarData,
  formatarDataCurta,
  formatarHora,
  formatarDataHora,
  formatarDiaDaSemana,
  formatarMoeda,
  formatarNumero,
  compararNomes,
  ordenarNomes,
} from '@/contract/format';

// Meio-dia evita que qualquer deslocamento de fuso empurre a data para outro dia.
const SEGUNDA = new Date(2026, 2, 16, 14, 30, 0);

describe('Data', () => {
  it('sai no formato brasileiro, não no americano', () => {
    expect(formatarData(SEGUNDA)).toBe('16/03/2026');
    // A falha clássica do ICU incompleto é justamente esta.
    expect(formatarData(SEGUNDA)).not.toBe('3/16/2026');
  });

  it('versão curta omite o ano', () => {
    expect(formatarDataCurta(SEGUNDA)).toBe('16/03');
  });

  it('aceita texto ISO e milissegundos, não só Date', () => {
    expect(formatarData('2026-03-16T12:00:00')).toBe('16/03/2026');
    expect(formatarData(SEGUNDA.getTime())).toBe('16/03/2026');
  });

  it('valor ausente ou ilegível vira travessão, nunca "Invalid Date"', () => {
    expect(formatarData(null)).toBe('—');
    expect(formatarData(undefined)).toBe('—');
    expect(formatarData('')).toBe('—');
    expect(formatarData('não é data')).toBe('—');
  });
});

describe('Hora', () => {
  it('sai em 24h — escala no Brasil não se lê com AM/PM', () => {
    expect(formatarHora(SEGUNDA)).toBe('14:30');
    expect(formatarHora(SEGUNDA)).not.toContain('PM');
  });

  it('meia-noite é 00:00, não 24:00 nem 12 AM', () => {
    expect(formatarHora(new Date(2026, 2, 16, 0, 0))).toBe('00:00');
  });

  it('ausente vira marcador de hora, não travessão', () => {
    // Numa grade, "--:--" ocupa o mesmo espaço que a hora e não desalinha a coluna.
    expect(formatarHora(null)).toBe('--:--');
  });

  it('data e hora juntas', () => {
    expect(formatarDataHora(SEGUNDA)).toBe('16/03/2026 14:30');
  });
});

describe('Dia da semana', () => {
  it('sai abreviado, em português, sem ponto', () => {
    expect(formatarDiaDaSemana(SEGUNDA)).toBe('seg');
    expect(formatarDiaDaSemana(new Date(2026, 2, 21))).toBe('sáb');
  });

  it('não sai em inglês', () => {
    expect(formatarDiaDaSemana(SEGUNDA)).not.toBe('Mon');
  });
});

describe('Moeda', () => {
  it('recebe centavos e sai em real', () => {
    expect(formatarMoeda(4990)).toBe('R$ 49,90');
    expect(formatarMoeda(0)).toBe('R$ 0,00');
  });

  it('não sai em dólar — a falha clássica do ICU incompleto', () => {
    expect(formatarMoeda(4990)).toContain('R$');
    expect(formatarMoeda(4990)).not.toContain('$4');
  });

  it('milhar usa ponto e decimal usa vírgula', () => {
    expect(formatarMoeda(129900)).toBe('R$ 1.299,00');
  });

  it('valor ausente vira travessão', () => {
    expect(formatarMoeda(null)).toBe('—');
    expect(formatarMoeda(undefined)).toBe('—');
  });
});

describe('Número', () => {
  it('usa vírgula decimal', () => {
    expect(formatarNumero(49.9)).toBe('49,9');
  });

  it('inteiro não ganha casa decimal à toa', () => {
    expect(formatarNumero(50)).toBe('50');
  });

  it('respeita o número de casas pedido', () => {
    expect(formatarNumero(1.239, 2)).toBe('1,24');
  });
});

describe('Ordenação de nomes', () => {
  it('acento não joga o nome para o fim da lista', () => {
    const nomes = ['Zoe', 'Ávila', 'Bruno'];
    expect(nomes.sort(compararNomes)).toEqual(['Ávila', 'Bruno', 'Zoe']);
  });

  it('número dentro do texto ordena como número', () => {
    // Sem isto, "Sala 10" vem antes de "Sala 2".
    const salas = ['Sala 10', 'Sala 2', 'Sala 1'];
    expect(salas.sort(compararNomes)).toEqual(['Sala 1', 'Sala 2', 'Sala 10']);
  });

  it('maiúscula e minúscula não separam nomes iguais', () => {
    expect(compararNomes('ana', 'ANA')).toBe(0);
  });

  it('ordenarNomes devolve cópia e não mexe no original', () => {
    const original = [{ n: 'Zoe' }, { n: 'Ávila' }];
    const ordenado = ordenarNomes(original, (x) => x.n);

    expect(ordenado.map((x) => x.n)).toEqual(['Ávila', 'Zoe']);
    expect(original.map((x) => x.n)).toEqual(['Zoe', 'Ávila']);
  });
});
