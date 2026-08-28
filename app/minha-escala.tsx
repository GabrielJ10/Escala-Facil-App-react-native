import { useEffect } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { usePainel, useResumoNotificacoes, type Turno } from '@/nucleo/consultas';
import { avaliarVersao } from '@/nucleo/versao';
import { usePortaoDeVersao } from '@/nucleo/consultas';
import { VERSAO_APP } from '@/nucleo/ambiente';
import { registrarAparelho, situacaoDaPermissao } from '@/nucleo/push';
import { Carregando, Erro } from '@/componentes/Estados';
import { usePodeVer } from '@/nucleo/sessao';
import { CartaoTurno } from '@/componentes/CartaoTurno';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';
import { formatarData, formatarHora, formatarDiaDaSemana } from '@/contract/format';

/**
 * Minha Escala — a tela onde o funcionário vive.
 *
 * DIVERGE do site — ver docs/divergencias-app-web.md. Lá é uma grade local × dia com oito
 * colunas e 1080px de largura mínima; num aparelho de 390px caberiam três dias. Aqui é
 * lista, que é como se lê a própria escala no celular.
 *
 * Consome `/users/me/dashboard`, que já devolve resumo, próximos e passados prontos — a tela
 * apresenta um agregado, não monta um. É o que a mantém rápida na abertura a frio.
 */
export default function MinhaEscala() {
  const painel = usePainel();
  const resumo = useResumoNotificacoes();

  useRegistroSilenciosoDeAparelho(!painel.isLoading && !painel.error);

  if (painel.isLoading) return <Carregando />;
  if (painel.error) return <Erro erro={painel.error} aoTentarDeNovo={() => void painel.refetch()} />;

  const proximo = painel.data?.next_shift ?? null;
  const proximos = painel.data?.upcoming_shifts ?? [];
  const naoLidas = resumo.data?.personal_notifications_count ?? 0;

  return (
    <ScrollView
      contentContainerStyle={estilos.tela}
      refreshControl={(
        <RefreshControl
          refreshing={painel.isRefetching}
          onRefresh={() => {
            void painel.refetch();
            void resumo.refetch();
          }}
        />
      )}
    >
      <AvisoDeVersao />

      {proximo ? <ProximoTurno turno={proximo} /> : <SemTurnos />}

      {proximos.length > 0 ? (
        <>
          <Text style={estilos.secao}>A seguir</Text>
          {proximos.map((turno) => <CartaoTurno key={turno.id} turno={turno} />)}
        </>
      ) : null}

      <AtalhosDoGestor />

      <View style={estilos.atalhos}>
        <Atalho rotulo="Trocas" destino="/trocas" />
        <Atalho rotulo="Afastamentos" destino="/afastamentos" />
        <Atalho rotulo="Avisos" destino="/notificacoes" contador={naoLidas} />
        <Atalho rotulo="Perfil" destino="/perfil" />
      </View>
    </ScrollView>
  );
}

/**
 * O que só quem monta escala vê.
 *
 * A decisão sai de `usePodeVer`, que lê as capacidades do backend — nunca de papel ou plano
 * conferido na tela. Papel e plano mudam de significado com o tempo; a capacidade é a
 * resposta do servidor à pergunta que estamos fazendo.
 */
function AtalhosDoGestor() {
  const podeVerEscala = usePodeVer('module_schedule');
  const podeAprovar = usePodeVer('module_shift_requests_admin');

  if (!podeVerEscala && !podeAprovar) return null;

  return (
    <>
      <Text style={estilos.secao}>Equipe</Text>
      <View style={estilos.atalhos}>
        {podeVerEscala ? <Atalho rotulo="Escala da equipe" destino="/escala" /> : null}
        {podeAprovar ? <Atalho rotulo="Solicitações" destino="/solicitacoes" /> : null}
      </View>
    </>
  );
}

/**
 * Registra o aparelho para push sem pedir nada.
 *
 * Só age quando a permissão JÁ foi concedida — reinstalação, troca de aparelho, ou o token
 * do Expo simplesmente girando, o que acontece sozinho. Nunca dispara o pedido do sistema:
 * isso é da tela `/avisos`, que explica antes, porque no iOS a recusa é definitiva.
 *
 * Espera a escala carregar para não competir com a primeira tela pela rede — o orçamento de
 * abertura a frio é 2s, e o registro pode esperar.
 */
function useRegistroSilenciosoDeAparelho(pronto: boolean) {
  useEffect(() => {
    if (!pronto) return;

    void (async () => {
      if (await situacaoDaPermissao() === 'concedida') await registrarAparelho();
    })();
  }, [pronto]);
}

/**
 * O aviso de atualização recomendada.
 *
 * Faixa, não tela: `recommended` não impede nada, e transformar sugestão em obstáculo ensina
 * a pessoa a ignorar o aviso que um dia vai importar. O bloqueio de verdade fica no
 * `PortaoDeVersao`, sobre o app inteiro.
 */
function AvisoDeVersao() {
  const portao = usePortaoDeVersao();
  if (avaliarVersao(VERSAO_APP, portao.data) !== 'atualizacao-sugerida') return null;

  return (
    <View style={estilos.faixaVersao}>
      <Text style={estilos.faixaVersaoTexto}>
        {portao.data?.message || 'Uma versão mais nova do aplicativo está disponível.'}
      </Text>
    </View>
  );
}

function ProximoTurno({ turno }: Readonly<{ turno: Turno }>) {
  return (
    <View style={estilos.destaque}>
      <Text style={estilos.destaqueRotulo}>PRÓXIMO TURNO</Text>
      <Text style={estilos.destaqueDia}>
        {formatarDiaDaSemana(turno.start_timestamp)}, {formatarData(turno.start_timestamp)}
      </Text>
      <Text style={estilos.destaqueHora}>
        {formatarHora(turno.start_timestamp)} às {formatarHora(turno.end_timestamp)}
      </Text>
      <Text style={estilos.destaqueLocal}>
        {turno.location?.name ?? 'Local não informado'}
      </Text>
    </View>
  );
}

function SemTurnos() {
  return (
    <View style={estilos.vazio}>
      <Text style={estilos.vazioTexto}>Você não tem turnos agendados.</Text>
    </View>
  );
}

function Atalho({ rotulo, destino, contador = 0 }: Readonly<{
  rotulo: string;
  destino: '/trocas' | '/afastamentos' | '/notificacoes' | '/perfil' | '/escala' | '/solicitacoes';
  contador?: number;
}>) {
  return (
    <Pressable
      style={estilos.atalho}
      onPress={() => router.push(destino)}
      accessibilityRole="button"
      accessibilityLabel={contador > 0 ? `${rotulo}, ${contador} não lidos` : rotulo}
    >
      <Text style={estilos.atalhoTexto}>{rotulo}</Text>
      {contador > 0 ? (
        <View style={estilos.selo}>
          <Text style={estilos.seloTexto}>{contador > 99 ? '99+' : contador}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: espacamento.md, gap: espacamento.sm },
  secao: {
    ...tipografia.micro,
    color: cores.textoSuave,
    textTransform: 'uppercase',
    marginTop: espacamento.md,
  },

  faixaVersao: {
    backgroundColor: cores.turnoPublicado,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.primaria,
    padding: espacamento.sm,
  },
  faixaVersaoTexto: { ...tipografia.legenda, color: cores.texto, textAlign: 'center' },

  destaque: {
    backgroundColor: cores.turnoPreenchido,
    borderRadius: raio.lg,
    padding: espacamento.md,
    borderWidth: 1,
    borderColor: cores.sucesso,
  },
  destaqueRotulo: { ...tipografia.micro, color: cores.sucesso },
  destaqueDia: {
    ...tipografia.subtitulo,
    color: cores.texto,
    marginTop: espacamento.xs,
    textTransform: 'capitalize',
  },
  destaqueHora: { ...tipografia.titulo, color: cores.texto },
  destaqueLocal: { ...tipografia.corpo, color: cores.textoSuave },

  vazio: { padding: espacamento.lg, alignItems: 'center' },
  vazioTexto: { ...tipografia.corpo, color: cores.textoSuave, textAlign: 'center' },

  atalhos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.sm,
    marginTop: espacamento.lg,
  },
  atalho: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: TOQUE_MINIMO,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.sm,
    borderRadius: raio.md,
    backgroundColor: cores.fundoCartao,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  atalhoTexto: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
  selo: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seloTexto: { ...tipografia.micro, color: cores.primariaTexto, fontWeight: '700' },
});
