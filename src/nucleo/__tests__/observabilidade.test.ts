/**
 * O relatório de erro é a única coisa no app que manda dado para fora sem ninguém pedir.
 *
 * Por isso o que estes testes protegem não é "o Sentry funciona" — isso é problema do
 * Sentry. É o contrário: que ele fique calado quando não foi configurado, e que o que sai
 * daqui não leve junto nada sobre a pessoa que usa o app.
 */
import { describe, expect, it, vi } from 'vitest';

const init = vi.fn();
const setUser = vi.fn();
const captureException = vi.fn();

vi.mock('@sentry/react-native', () => ({ init, setUser, captureException }));

const ambiente = { AMBIENTE: 'production', EH_PRODUCAO: true, VERSAO_APP: '0.1.0', SENTRY_DSN: '' };
vi.mock('@/nucleo/ambiente', () => ambiente);

/** Cada caso precisa do módulo com o estado zerado: `iniciar` é idempotente de propósito. */
async function carregar(dsn: string, producao = true) {
  vi.resetModules();
  init.mockClear();
  setUser.mockClear();
  captureException.mockClear();
  ambiente.SENTRY_DSN = dsn;
  ambiente.EH_PRODUCAO = producao;
  ambiente.AMBIENTE = producao ? 'production' : 'development';
  return import('@/nucleo/observabilidade');
}

describe('sem DSN', () => {
  /**
   * O caso normal em desenvolvimento. Se isto quebrar, todo mundo que clona o repositório
   * descobre no primeiro `expo start` — e o erro de quem edita código vai poluir o painel
   * onde o erro de gente de verdade precisa aparecer.
   */
  it('não inicializa nada', async () => {
    const obs = await carregar('');
    obs.iniciarObservabilidade();

    expect(init).not.toHaveBeenCalled();
    expect(obs.observabilidadeAtiva()).toBe(false);
  });

  it('identificar e registrar viram função vazia, não exceção', async () => {
    const obs = await carregar('');
    obs.iniciarObservabilidade();

    expect(() => obs.identificarMembro('m1')).not.toThrow();
    expect(() => obs.registrarFalhaTratada(new Error('x'))).not.toThrow();
    expect(setUser).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe('com DSN', () => {
  const DSN = 'https://chave@o1.ingest.sentry.io/2';

  it('inicializa uma vez só, mesmo chamando de novo', async () => {
    const obs = await carregar(DSN);
    obs.iniciarObservabilidade();
    obs.iniciarObservabilidade();

    expect(init).toHaveBeenCalledTimes(1);
    expect(obs.observabilidadeAtiva()).toBe(true);
  });

  /**
   * `sendDefaultPii` ligado faz o Sentry anexar IP e dados da requisição por conta própria.
   * Num app que carrega escala de funcionário, isso é vazamento — e é o padrão de fábrica em
   * várias integrações, então merece um teste que reprove se alguém ligar.
   */
  it('nunca liga o envio automático de dado pessoal', async () => {
    const obs = await carregar(DSN);
    obs.iniciarObservabilidade();

    expect(init.mock.calls[0][0].sendDefaultPii).toBe(false);
  });

  /**
   * Testar a peneira isolada não basta: ela só protege alguém se estiver ligada no `init`.
   * Sem esta asserção, trocar `beforeBreadcrumb` por `undefined` passa em tudo — e o corpo
   * de cada requisição volta a sair do aparelho.
   */
  it('liga a peneira no init, e não só a define', async () => {
    const obs = await carregar(DSN);
    obs.iniciarObservabilidade();

    expect(init.mock.calls[0][0].beforeBreadcrumb).toBe(obs.peneirarMigalha);
  });

  it('marca release e ambiente, sem os quais o relatório não aponta linha nenhuma', async () => {
    const obs = await carregar(DSN);
    obs.iniciarObservabilidade();

    const config = init.mock.calls[0][0];
    expect(config.release).toBe('br.app.escalafacil@0.1.0');
    expect(config.environment).toBe('production');
  });

  it('amostra 10% em produção e tudo fora dela', async () => {
    const emProducao = await carregar(DSN, true);
    emProducao.iniciarObservabilidade();
    expect(init.mock.calls[0][0].tracesSampleRate).toBe(0.1);

    const fora = await carregar(DSN, false);
    fora.iniciarObservabilidade();
    expect(init.mock.calls[0][0].tracesSampleRate).toBe(1.0);
  });

  it('identifica pelo id, e o encerramento apaga a identificação', async () => {
    const obs = await carregar(DSN);
    obs.iniciarObservabilidade();

    obs.identificarMembro('11111111-1111-4111-8111-111111111111');
    expect(setUser).toHaveBeenCalledWith({ id: '11111111-1111-4111-8111-111111111111' });

    obs.identificarMembro(null);
    expect(setUser).toHaveBeenLastCalledWith(null);
  });
});

describe('peneira das migalhas', () => {
  const DSN = 'https://chave@o1.ingest.sentry.io/2';

  it('descarta cabeçalho de autenticação', async () => {
    const obs = await carregar(DSN);
    const saida = obs.peneirarMigalha({
      category: 'fetch',
      data: { url: '/shifts', method: 'GET', Authorization: 'Bearer abc', cookie: 'x=1' },
    });

    expect(saida?.data).toEqual({ url: '/shifts', method: 'GET' });
  });

  it('descarta corpo e resposta, que é onde a escala de alguém estaria', async () => {
    const obs = await carregar(DSN);
    const saida = obs.peneirarMigalha({
      category: 'fetch',
      data: { url: '/users/me', status_code: 200, body: { nome: 'Fulano' }, response: { turnos: [] } },
    });

    expect(saida?.data).toEqual({ url: '/users/me', status_code: 200 });
  });

  it('preserva o que interessa depurar', async () => {
    const obs = await carregar(DSN);
    const saida = obs.peneirarMigalha({
      category: 'fetch',
      data: { url: '/shifts', method: 'POST', status_code: 409 },
    });

    expect(saida?.data).toEqual({ url: '/shifts', method: 'POST', status_code: 409 });
  });

  it('em produção, migalha de console não sai do aparelho', async () => {
    const obs = await carregar(DSN, true);
    expect(obs.peneirarMigalha({ category: 'console', message: 'token=abc' })).toBeNull();
  });

  /**
   * `Sentry.wrap` registra cada toque com o rótulo de acessibilidade do elemento. Neste app
   * o rótulo de um cartão de turno é o nome de quem está escalado — ou seja, a migalha de
   * toque é um vazamento de nome de funcionário disfarçado de telemetria de interface.
   */
  it('em produção, migalha de toque não sai — o rótulo costuma ser um nome', async () => {
    const obs = await carregar(DSN, true);
    expect(
      obs.peneirarMigalha({ category: 'touch', message: 'Touch: Turno de Maria Silva' }),
    ).toBeNull();
  });

  it('fora de produção, migalha de console passa — é onde ela ajuda', async () => {
    const obs = await carregar(DSN, false);
    expect(obs.peneirarMigalha({ category: 'console', message: 'oi' })).not.toBeNull();
  });

  it('migalha sem dados atravessa inteira', async () => {
    const obs = await carregar(DSN);
    const nav = { category: 'navigation', data: undefined };
    expect(obs.peneirarMigalha(nav)).toBe(nav);
    expect(obs.peneirarMigalha(null)).toBeNull();
  });
});
