import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  aplicarAoMapeamento,
  detalhesDoEvento,
  lerMapeamento,
  planejarSincronizacao,
  tituloDoEvento,
  type Janela,
  type Mapeamento,
  type TurnoParaCalendario,
} from './calendario';

/**
 * A escala no calendário do celular.
 *
 * Casca fina sobre `expo-calendar` — EventKit no iOS, CalendarContract no Android — e sobre
 * `calendario.ts`, que decide o que fazer. Aqui só há execução e persistência.
 *
 * **Desvio do plano, e por quê.** A Fase 7 previa escrever o módulo nativo à mão, em Swift e
 * Kotlin, atrás de uma interface única. `expo-calendar` já é exatamente isso, mantido pela
 * Expo e versionado com o SDK. Escrever o nosso seria manter duas pontes nativas, uma
 * migração a cada versão do SDK, e um plugin de configuração próprio — para chegar à mesma
 * funcionalidade que o usuário vê.
 *
 * A prioridade declarada para este app foi pouca manutenção. Módulo nativo próprio é o
 * oposto disso, e o argumento a favor dele — provar que o app é nativo de verdade para a
 * regra 4.2 da Apple — vale igual com `expo-calendar`: a integração com o calendário do
 * sistema é a mesma, feita por código nativo, só que não escrito por nós.
 *
 * Se um dia a Expo abandonar o módulo, ou faltar um recurso, o caminho de volta continua
 * aberto: `calendario.ts` não sabe que ele existe, e só este arquivo precisaria mudar.
 *
 * **Um calendário dedicado, nunca o principal.** Os eventos vão para um calendário próprio,
 * "Escala Fácil". É o que permite desligar a sincronização e apagar tudo de uma vez, e o que
 * garante que desinstalar o app não deixe lixo espalhado na agenda pessoal.
 */

const CHAVE_DO_MAPEAMENTO = 'escala-facil.calendario.eventos';
const CHAVE_DO_CALENDARIO = 'escala-facil.calendario.id';
const NOME_DO_CALENDARIO = 'Escala Fácil';

export type ResultadoDaSincronizacao =
  | { ok: true; criados: number; atualizados: number; removidos: number }
  | { ok: false; motivo: 'sem-permissao' | 'sem-calendario' | 'falhou' };

export async function permissaoConcedida(): Promise<boolean> {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  return status === 'granted';
}

/** Pede a permissão. A tela que chama já deve ter explicado para quê. */
export async function pedirPermissao(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

async function lerMapeamentoDoDisco(): Promise<Mapeamento> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_DO_MAPEAMENTO);
    return lerMapeamento(bruto ? JSON.parse(bruto) : null);
  } catch {
    // Disco ilegível é mapeamento vazio, não app quebrado. O pior que acontece é o próximo
    // sync recriar eventos — chato, e melhor que travar.
    return {};
  }
}

async function gravarMapeamento(mapeamento: Mapeamento): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE_DO_MAPEAMENTO, JSON.stringify(mapeamento));
  } catch {
    // Sem gravar, o próximo sync recria o que já existe. É degradação, não falha fatal.
  }
}

/**
 * A fonte que o calendário novo precisa ter.
 *
 * É onde as duas plataformas mais divergem. O iOS exige uma `source` de verdade — a do
 * calendário padrão, senão o evento não aparece em lugar nenhum. O Android aceita um
 * `ACCOUNT_TYPE_LOCAL`, que é o que mantém os eventos no aparelho em vez de subir para uma
 * conta Google que a pessoa não escolheu compartilhar com a gente.
 */
async function fonteDoCalendario(): Promise<Calendar.Source | { isLocalAccount: true; name: string; type: string }> {
  if (Platform.OS === 'ios') {
    const padrao = await Calendar.getDefaultCalendarAsync();
    return padrao.source;
  }
  return {
    isLocalAccount: true,
    name: NOME_DO_CALENDARIO,
    type: Calendar.SourceType.LOCAL,
  };
}

/**
 * O calendário dedicado, criado na primeira vez.
 *
 * O id é guardado, mas nunca confiado: a pessoa pode apagar o calendário pelo aplicativo de
 * agenda dela, e aí o id gravado aponta para nada. Por isso ele é conferido contra a lista
 * real antes de ser usado.
 */
async function calendarioDedicado(): Promise<string | null> {
  try {
    const existentes = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

    const gravado = await AsyncStorage.getItem(CHAVE_DO_CALENDARIO);
    if (gravado && existentes.some((c) => c.id === gravado)) return gravado;

    const porNome = existentes.find((c) => c.title === NOME_DO_CALENDARIO);
    if (porNome) {
      await AsyncStorage.setItem(CHAVE_DO_CALENDARIO, porNome.id);
      return porNome.id;
    }

    const fonte = await fonteDoCalendario();
    const id = await Calendar.createCalendarAsync({
      title: NOME_DO_CALENDARIO,
      name: NOME_DO_CALENDARIO,
      color: '#2E4BD8',
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: (fonte as Calendar.Source).id,
      source: fonte as Calendar.Source,
      ownerAccount: 'personal',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });

    await AsyncStorage.setItem(CHAVE_DO_CALENDARIO, id);
    return id;
  } catch {
    return null;
  }
}

function paraEvento(turno: TurnoParaCalendario, calendarioId: string) {
  return {
    calendarId: calendarioId,
    title: tituloDoEvento(turno),
    notes: detalhesDoEvento(turno),
    startDate: new Date(turno.start_timestamp),
    endDate: new Date(turno.end_timestamp),
    location: turno.location?.name ?? undefined,
  };
}

/**
 * Põe o calendário em dia com a escala.
 *
 * Cada operação é isolada: uma que falhe não derruba as outras, e o mapeamento só registra o
 * que realmente aconteceu. Assim uma falha parcial é retomada no próximo sync, em vez de
 * deixar o mapeamento afirmando coisas que o calendário não tem.
 */
export async function sincronizar(
  turnos: TurnoParaCalendario[],
  janela: Janela,
  fuso: string,
): Promise<ResultadoDaSincronizacao> {
  if (!await permissaoConcedida()) return { ok: false, motivo: 'sem-permissao' };

  const calendarioId = await calendarioDedicado();
  if (!calendarioId) return { ok: false, motivo: 'sem-calendario' };

  try {
    const mapeamento = await lerMapeamentoDoDisco();
    const plano = planejarSincronizacao(turnos, mapeamento, janela);

    const criados: Array<{ turno: TurnoParaCalendario; eventoId: string }> = [];
    const atualizados: Array<{ turno: TurnoParaCalendario; eventoId: string }> = [];
    const removidos: string[] = [];

    for (const turno of plano.criar) {
      try {
        const eventoId = await Calendar.createEventAsync(calendarioId, paraEvento(turno, calendarioId));
        criados.push({ turno, eventoId });
      } catch { /* tentado de novo no próximo sync */ }
    }

    for (const { turno, eventoId } of plano.atualizar) {
      try {
        await Calendar.updateEventAsync(eventoId, paraEvento(turno, calendarioId));
        atualizados.push({ turno, eventoId });
      } catch { /* idem */ }
    }

    for (const { turnoId, eventoId } of plano.remover) {
      try {
        await Calendar.deleteEventAsync(eventoId);
        removidos.push(turnoId);
      } catch {
        // Evento já apagado pela pessoa no aplicativo de agenda: sai do mapeamento do mesmo
        // jeito. Insistir em apagar o que não existe travaria o sync para sempre.
        removidos.push(turnoId);
      }
    }

    await gravarMapeamento(aplicarAoMapeamento(
      mapeamento,
      { criados, atualizados, removidos },
      fuso,
    ));

    return {
      ok: true,
      criados: criados.length,
      atualizados: atualizados.length,
      removidos: removidos.length,
    };
  } catch {
    return { ok: false, motivo: 'falhou' };
  }
}

/**
 * Desliga a sincronização e limpa o que foi criado.
 *
 * Apagar o calendário inteiro é mais confiável que apagar evento por evento: se o mapeamento
 * estiver incompleto — e ele pode estar, depois de falhas parciais — a limpeza por evento
 * deixaria sobras na agenda da pessoa.
 */
export async function desligarESincronizar(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(CHAVE_DO_CALENDARIO);
    if (id) await Calendar.deleteCalendarAsync(id);
  } catch {
    // Calendário já removido pela pessoa: o resultado desejado já é o atual.
  } finally {
    await AsyncStorage.multiRemove([CHAVE_DO_MAPEAMENTO, CHAVE_DO_CALENDARIO]);
  }
}
