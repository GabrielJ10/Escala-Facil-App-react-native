/**
 * O portão de versão, do lado do app.
 *
 * O binário instalado pode estar semanas atrás do servidor — atualizar é opcional e a loja
 * demora. Sem portão, uma rota que muda de forma quebra um app antigo sem explicação: a tela
 * fica vazia, ou pior, mostra dado errado com cara de certo.
 *
 * Duas linhas, e a diferença entre elas é o que evita transformar cada release num
 * transtorno: `minimum` bloqueia, `recommended` só avisa.
 *
 * A comparação é pura e tem teste porque é onde este tipo de código erra, sempre do mesmo
 * jeito: comparando como texto. Em texto, "0.10.0" < "0.9.0" — e o app bloquearia justamente
 * quem já atualizou.
 */

export type PortaoDeVersao = {
  minimum: string;
  recommended: string;
  message: string;
  enforced: boolean;
  store_url: { ios: string | null; android: string | null };
};

export type VeredictoDeVersao = 'bloqueado' | 'atualizacao-sugerida' | 'ok';

/** Converte "1.2.3" em [1,2,3], tolerando sufixos e pedaços faltando. */
function partes(versao: string): number[] {
  return String(versao || '0')
    .trim()
    .split('.')
    .slice(0, 3)
    .map((parte) => {
      const numero = Number.parseInt(parte, 10);
      return Number.isFinite(numero) && numero >= 0 ? numero : 0;
    });
}

/**
 * Compara duas versões: negativo se `a` é mais antiga, zero se iguais, positivo se mais nova.
 *
 * Componentes ausentes contam como zero, então "1.2" e "1.2.0" são a mesma versão.
 */
export function compararVersoes(a: string, b: string): number {
  const va = partes(a);
  const vb = partes(b);

  for (let i = 0; i < 3; i += 1) {
    const diferenca = (va[i] ?? 0) - (vb[i] ?? 0);
    if (diferenca !== 0) return diferenca;
  }
  return 0;
}

/**
 * O que fazer com a versão instalada.
 *
 * `enforced: false` existe para desligar o bloqueio sem redeploy, se ele se mostrar agressivo
 * demais em produção. Nesse caso o que seria bloqueio vira sugestão — nunca silêncio: quem
 * está numa versão abaixo do mínimo continua precisando saber.
 *
 * Portão ausente ou ilegível NÃO bloqueia. O app precisa funcionar quando o servidor está
 * fora do ar ou quando a resposta muda de forma; travar por não conseguir perguntar se pode
 * destravar seria o pior desfecho possível.
 */
export function avaliarVersao(
  instalada: string,
  portao: Partial<PortaoDeVersao> | null | undefined,
): VeredictoDeVersao {
  if (!portao) return 'ok';

  const minimo = typeof portao.minimum === 'string' ? portao.minimum : '';
  const recomendado = typeof portao.recommended === 'string' ? portao.recommended : '';

  if (minimo && compararVersoes(instalada, minimo) < 0) {
    return portao.enforced === false ? 'atualizacao-sugerida' : 'bloqueado';
  }

  if (recomendado && compararVersoes(instalada, recomendado) < 0) {
    return 'atualizacao-sugerida';
  }

  return 'ok';
}
