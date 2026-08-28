import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  useAfastamentosParaAprovar,
  useTrocasParaAprovar,
  type AfastamentoParaAprovar,
  type Troca,
} from '@/nucleo/consultas';
import { rotuloDaSituacaoDaTroca } from '@/nucleo/apresentacao';
import { Carregando, Erro, Vazio } from '@/componentes/Estados';
import { usePodeVer } from '@/nucleo/sessao';
import { cores, espacamento, raio, tipografia } from '@/nucleo/tema';
import { formatarData, formatarHora, formatarDiaDaSemana } from '@/contract/format';

/**
 * Solicitações que esperam o gestor.
 *
 * É o destino de `pending_admin_requests` e `pending_absence_requests` no mapa de rotas do
 * push. A tela precisa existir para o push ter onde aterrissar — abrir numa rota inexistente
 * é o defeito que este mapa foi feito para evitar.
 *
 * **Somente leitura, e isso é escolha, não corte de escopo.** Aprovar uma troca exige o
 * fluxo de duas etapas do backend: `POST /requests/:id/preview-impact` devolve um
 * `preview_hash` que `approveSchema` exige como obrigatório, e o preview traz os conflitos
 * que o gestor tem que ver ANTES de decidir — turno descoberto, carga horária estourada,
 * qualificação faltando. Um botão "aprovar" que pulasse essa leitura seria pior que não ter
 * botão: decidiria no escuro.
 *
 * A aprovação com preview é a Fase 5, junto com as demais telas de gestor. Até lá esta tela
 * mostra o que está parado e diz onde resolver.
 */
export default function Solicitacoes() {
  // A capacidade vem do backend; nunca conferir papel ou plano direto na tela.
  const podeVerTrocas = usePodeVer('module_shift_requests_admin');
  const podeVerAfastamentos = usePodeVer('action_review_absence_requests');

  const trocas = useTrocasParaAprovar(podeVerTrocas);
  const afastamentos = useAfastamentosParaAprovar(podeVerAfastamentos);

  if (!podeVerTrocas && !podeVerAfastamentos) {
    return (
      <Vazio
        titulo="Sem acesso"
        detalhe="Esta tela é de quem aprova solicitações da equipe."
      />
    );
  }

  const carregando = (podeVerTrocas && trocas.isLoading)
    || (podeVerAfastamentos && afastamentos.isLoading);
  if (carregando) return <Carregando />;

  const erro = trocas.error ?? afastamentos.error;
  if (erro) {
    return (
      <Erro
        erro={erro}
        aoTentarDeNovo={() => {
          void trocas.refetch();
          void afastamentos.refetch();
        }}
      />
    );
  }

  const listaDeTrocas = trocas.data ?? [];
  const listaDeAfastamentos = afastamentos.data ?? [];
  const vazio = listaDeTrocas.length === 0 && listaDeAfastamentos.length === 0;

  return (
    <ScrollView
      contentContainerStyle={estilos.tela}
      refreshControl={(
        <RefreshControl
          refreshing={trocas.isRefetching || afastamentos.isRefetching}
          onRefresh={() => {
            void trocas.refetch();
            void afastamentos.refetch();
          }}
        />
      )}
    >
      {vazio ? (
        <Vazio titulo="Nada parado" detalhe="Nenhuma solicitação esperando decisão." />
      ) : null}

      {listaDeTrocas.length > 0 ? (
        <>
          <Text style={estilos.secao}>Trocas de turno</Text>
          {listaDeTrocas.map((troca) => <ItemDeTroca key={troca.id} troca={troca} />)}
        </>
      ) : null}

      {listaDeAfastamentos.length > 0 ? (
        <>
          <Text style={estilos.secao}>Afastamentos</Text>
          {listaDeAfastamentos.map((pedido) => (
            <ItemDeAfastamento key={pedido.id} pedido={pedido} />
          ))}
        </>
      ) : null}

      {!vazio ? (
        <Text style={estilos.aviso}>
          Para aprovar ou recusar, abra a Escala Fácil no computador — a decisão mostra os
          conflitos que a troca causa antes de confirmar.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function ItemDeTroca({ troca }: Readonly<{ troca: Troca }>) {
  const turno = troca.source_shift;

  return (
    <View style={estilos.cartao}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.pessoa} numberOfLines={1}>
          {troca.requester?.name || 'Colaborador'} → {troca.target?.name || 'Colaborador'}
        </Text>
        <Text style={estilos.situacao}>{rotuloDaSituacaoDaTroca(troca.status)}</Text>
      </View>

      {turno ? (
        <Text style={estilos.detalhe}>
          {formatarDiaDaSemana(turno.start_timestamp)}, {formatarData(turno.start_timestamp)}
          {' · '}
          {formatarHora(turno.start_timestamp)} às {formatarHora(turno.end_timestamp)}
        </Text>
      ) : null}
    </View>
  );
}

function ItemDeAfastamento({ pedido }: Readonly<{ pedido: AfastamentoParaAprovar }>) {
  const aoMeioDia = (dia: string) => `${String(dia).slice(0, 10)}T12:00:00`;

  return (
    <View style={estilos.cartao}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.pessoa} numberOfLines={1}>
          {pedido.target_name || pedido.requester_name || 'Colaborador'}
        </Text>
        <Text style={estilos.situacao}>Em análise</Text>
      </View>

      <Text style={estilos.detalhe}>
        {formatarData(aoMeioDia(pedido.start_date))} a {formatarData(aoMeioDia(pedido.end_date))}
      </Text>
      <Text style={estilos.motivo}>{pedido.reason}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: espacamento.md, gap: espacamento.sm, flexGrow: 1 },
  secao: {
    ...tipografia.micro,
    color: cores.textoSuave,
    textTransform: 'uppercase',
    marginTop: espacamento.sm,
  },

  cartao: {
    backgroundColor: cores.fundoCartao,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espacamento.md,
    gap: espacamento.xs,
  },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  pessoa: { ...tipografia.corpo, color: cores.texto, fontWeight: '600', flex: 1 },
  situacao: { ...tipografia.micro, color: cores.aviso, textTransform: 'uppercase' },
  detalhe: { ...tipografia.legenda, color: cores.texto, textTransform: 'capitalize' },
  motivo: { ...tipografia.legenda, color: cores.textoSuave },

  aviso: {
    ...tipografia.legenda,
    color: cores.textoSuave,
    textAlign: 'center',
    marginTop: espacamento.md,
  },
});
