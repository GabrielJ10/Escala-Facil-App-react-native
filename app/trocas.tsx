import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTrocasParaMim, useTrocasQueEuPedi, useResponderTroca, type Troca } from '@/nucleo/consultas';
import { podeResponderTroca, rotuloDaSituacaoDaTroca, trocaEstaAberta } from '@/nucleo/apresentacao';
import { Carregando, Erro, FaixaDeErro, Vazio } from '@/componentes/Estados';
import { useSessao } from '@/nucleo/sessao';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';
import { formatarData, formatarHora, formatarDiaDaSemana } from '@/contract/format';

/**
 * Trocas de turno.
 *
 * Duas listas de naturezas diferentes: as que **esperam resposta minha** (têm ação, e por
 * isso vêm primeiro) e as que **eu pedi** (são acompanhamento).
 *
 * A ordem importa mais aqui que no site: no celular não cabem duas colunas, então o que
 * exige ação precisa estar na frente do que só informa.
 */
type Aba = 'paraMim' | 'queEuPedi';

export default function Trocas() {
  const [aba, setAba] = useState<Aba>('paraMim');
  const { membro } = useSessao();

  const paraMim = useTrocasParaMim();
  const queEuPedi = useTrocasQueEuPedi();
  const responder = useResponderTroca();

  const atual = aba === 'paraMim' ? paraMim : queEuPedi;

  // O contador da aba conta só o que exige ação, não o total. Um "12" que inclui trocas já
  // resolvidas transforma o número num enfeite: a pessoa aprende a ignorá-lo.
  const pendentes = (paraMim.data ?? []).filter((t) => podeResponderTroca(t, membro?.id)).length;

  if (atual.isLoading) return <Carregando />;
  if (atual.error) return <Erro erro={atual.error} aoTentarDeNovo={() => void atual.refetch()} />;

  return (
    <View style={estilos.tela}>
      <View style={estilos.abas}>
        <BotaoAba
          rotulo="Para responder"
          ativa={aba === 'paraMim'}
          contador={pendentes}
          onPress={() => setAba('paraMim')}
        />
        <BotaoAba
          rotulo="Que eu pedi"
          ativa={aba === 'queEuPedi'}
          contador={0}
          onPress={() => setAba('queEuPedi')}
        />
      </View>

      <ScrollView
        contentContainerStyle={estilos.lista}
        refreshControl={(
          <RefreshControl refreshing={atual.isRefetching} onRefresh={() => void atual.refetch()} />
        )}
      >
        {responder.error ? <FaixaDeErro erro={responder.error} /> : null}

        {(atual.data ?? []).length === 0 ? <SemTrocas aba={aba} /> : null}

        {(atual.data ?? []).map((troca) => (
          <CartaoTroca
            key={troca.id}
            troca={troca}
            podeResponder={podeResponderTroca(troca, membro?.id)}
            respondendo={responder.isPending && responder.variables?.id === troca.id}
            aoResponder={(aceitar) => responder.mutate({ id: troca.id, aceitar })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function SemTrocas({ aba }: Readonly<{ aba: Aba }>) {
  if (aba === 'paraMim') {
    return (
      <Vazio
        titulo="Nada esperando você"
        detalhe="Quando alguém pedir uma troca com você, ela aparece aqui."
      />
    );
  }

  return (
    <Vazio
      titulo="Você não pediu trocas"
      detalhe="Peça uma troca pela escala, no computador."
    />
  );
}

function BotaoAba({ rotulo, ativa, contador, onPress }: Readonly<{
  rotulo: string; ativa: boolean; contador: number; onPress: () => void;
}>) {
  return (
    <Pressable
      style={[estilos.aba, ativa && estilos.abaAtiva]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: ativa }}
      accessibilityLabel={contador > 0 ? `${rotulo}, ${contador} aguardando` : rotulo}
    >
      <Text style={[estilos.abaTexto, ativa && estilos.abaTextoAtiva]}>
        {rotulo}{contador > 0 ? ` (${contador})` : ''}
      </Text>
    </Pressable>
  );
}

function CartaoTroca({ troca, podeResponder, respondendo, aoResponder }: Readonly<{
  troca: Troca;
  podeResponder: boolean;
  respondendo: boolean;
  aoResponder: (aceitar: boolean) => void;
}>) {
  const aberta = trocaEstaAberta(troca.status);

  return (
    <View style={estilos.cartao}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.pessoa} numberOfLines={1}>
          {troca.requester?.name || 'Alguém da equipe'}
        </Text>
        <Text style={[estilos.situacao, aberta && estilos.situacaoAberta]}>
          {rotuloDaSituacaoDaTroca(troca.status)}
        </Text>
      </View>

      {troca.source_shift ? <LinhaTurno rotulo="Turno oferecido" turno={troca.source_shift} /> : null}
      {troca.target_shift ? <LinhaTurno rotulo="Em troca de" turno={troca.target_shift} /> : null}

      {podeResponder ? (
        <View style={estilos.acoes}>
          <Pressable
            style={[estilos.acao, estilos.recusar]}
            onPress={() => aoResponder(false)}
            disabled={respondendo}
            accessibilityRole="button"
            accessibilityLabel="Recusar a troca"
          >
            <Text style={estilos.recusarTexto}>Recusar</Text>
          </Pressable>

          <Pressable
            style={[estilos.acao, estilos.aceitar, respondendo && estilos.desabilitado]}
            onPress={() => aoResponder(true)}
            disabled={respondendo}
            accessibilityRole="button"
            accessibilityLabel="Aceitar a troca"
          >
            {respondendo
              ? <ActivityIndicator color={cores.primariaTexto} />
              : <Text style={estilos.aceitarTexto}>Aceitar</Text>}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function LinhaTurno({ rotulo, turno }: Readonly<{
  rotulo: string;
  turno: NonNullable<Troca['source_shift']>;
}>) {
  return (
    <View style={estilos.linhaTurno}>
      <Text style={estilos.rotuloTurno}>{rotulo}</Text>
      <Text style={estilos.textoTurno}>
        {formatarDiaDaSemana(turno.start_timestamp)}, {formatarData(turno.start_timestamp)}
        {' · '}
        {formatarHora(turno.start_timestamp)} às {formatarHora(turno.end_timestamp)}
      </Text>
      <Text style={estilos.localTurno}>{turno.location?.name ?? '—'}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  abas: { flexDirection: 'row', padding: espacamento.md, gap: espacamento.sm },
  aba: {
    flex: 1,
    minHeight: TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: raio.md,
    backgroundColor: cores.secundaria,
  },
  abaAtiva: { backgroundColor: cores.primaria },
  abaTexto: { ...tipografia.legenda, color: cores.textoSuave, fontWeight: '600' },
  abaTextoAtiva: { color: cores.primariaTexto },

  lista: { padding: espacamento.md, paddingTop: 0, gap: espacamento.sm, flexGrow: 1 },
  cartao: {
    backgroundColor: cores.fundoCartao,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espacamento.md,
    gap: espacamento.sm,
  },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  pessoa: { ...tipografia.corpo, color: cores.texto, fontWeight: '600', flex: 1 },
  situacao: { ...tipografia.micro, color: cores.textoSuave, textTransform: 'uppercase' },
  situacaoAberta: { color: cores.aviso },

  linhaTurno: { gap: 2 },
  rotuloTurno: { ...tipografia.micro, color: cores.textoSuave, textTransform: 'uppercase' },
  textoTurno: { ...tipografia.corpo, color: cores.texto, textTransform: 'capitalize' },
  localTurno: { ...tipografia.legenda, color: cores.textoSuave },

  acoes: { flexDirection: 'row', gap: espacamento.sm, marginTop: espacamento.xs },
  acao: {
    flex: 1,
    minHeight: TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: raio.md,
  },
  desabilitado: { opacity: 0.7 },
  aceitar: { backgroundColor: cores.primaria },
  aceitarTexto: { ...tipografia.corpo, color: cores.primariaTexto, fontWeight: '600' },
  recusar: { backgroundColor: cores.secundaria },
  recusarTexto: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
});
