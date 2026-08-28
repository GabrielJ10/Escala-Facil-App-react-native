import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import {
  useMarcarTodasLidas,
  useNotificacoes,
  useRegistrarClique,
  type Notificacao,
} from '@/nucleo/consultas';
import { contarNaoLidas, naoFoiLida } from '@/nucleo/apresentacao';
import { ehDestinoDeCobranca, rotaDaNotificacao } from '@/nucleo/rotas-do-push';
import { Carregando, Erro, Vazio } from '@/componentes/Estados';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';
import { formatarDataHora } from '@/contract/format';

/**
 * Central de notificações.
 *
 * É também onde o push aterrissa quando o destino não é uma tela específica, então precisa
 * funcionar bem aberta a frio, sem nada em cache.
 *
 * Tocar num item faz duas coisas numa ordem que importa: registra o clique (que o servidor
 * também trata como leitura) e navega. A navegação nunca espera a rede — se o registro
 * falhar, a pessoa ainda chega onde queria.
 */
export default function Notificacoes() {
  const lista = useNotificacoes();
  const registrarClique = useRegistrarClique();
  const marcarTodas = useMarcarTodasLidas();

  const itens = lista.data ?? [];
  const naoLidas = contarNaoLidas(itens);

  const abrir = (notificacao: Notificacao) => {
    registrarClique.mutate(notificacao.id);

    const rota = rotaDaNotificacao(notificacao);

    // Cobrança nunca vira paywall: a rota neutra só faz sentido para quem realmente está
    // bloqueado. Com o acesso funcionando, interromper a leitura com um aviso de assinatura
    // seria ruído — e para o funcionário, que não paga, seria ruído sem saída.
    if (ehDestinoDeCobranca(rota)) return;

    router.push(rota);
  };

  if (lista.isLoading) return <Carregando />;
  if (lista.error) return <Erro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />;

  return (
    <View style={estilos.tela}>
      {naoLidas > 0 ? (
        <Pressable
          style={estilos.marcarTodas}
          onPress={() => marcarTodas.mutate()}
          disabled={marcarTodas.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Marcar as ${naoLidas} não lidas como lidas`}
        >
          <Text style={estilos.marcarTodasTexto}>
            Marcar {naoLidas} como {naoLidas === 1 ? 'lida' : 'lidas'}
          </Text>
        </Pressable>
      ) : null}

      <ScrollView
        contentContainerStyle={estilos.lista}
        refreshControl={(
          <RefreshControl refreshing={lista.isRefetching} onRefresh={() => void lista.refetch()} />
        )}
      >
        {itens.length === 0 ? (
          <Vazio
            titulo="Nada por aqui"
            detalhe="Avisos sobre sua escala e suas trocas aparecem nesta tela."
          />
        ) : null}

        {itens.map((notificacao) => (
          <CartaoNotificacao
            key={notificacao.id}
            notificacao={notificacao}
            aoAbrir={() => abrir(notificacao)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function CartaoNotificacao({ notificacao, aoAbrir }: Readonly<{
  notificacao: Notificacao;
  aoAbrir: () => void;
}>) {
  const pendente = naoFoiLida(notificacao);

  return (
    <Pressable
      style={[estilos.cartao, pendente && estilos.cartaoNaoLido]}
      onPress={aoAbrir}
      accessibilityRole="button"
      accessibilityLabel={
        `${pendente ? 'Não lida. ' : ''}${notificacao.title}. ${notificacao.message}`
      }
    >
      <View style={estilos.cabecalho}>
        {pendente ? <View style={estilos.marcador} /> : null}
        <Text style={[estilos.titulo, pendente && estilos.tituloNaoLido]} numberOfLines={2}>
          {notificacao.title}
        </Text>
      </View>

      <Text style={estilos.mensagem}>{notificacao.message}</Text>
      <Text style={estilos.quando}>{formatarDataHora(notificacao.created_at)}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },

  marcarTodas: {
    minHeight: TOQUE_MINIMO,
    marginHorizontal: espacamento.md,
    marginTop: espacamento.md,
    borderRadius: raio.md,
    backgroundColor: cores.secundaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcarTodasTexto: { ...tipografia.legenda, color: cores.primaria, fontWeight: '600' },

  lista: { padding: espacamento.md, gap: espacamento.sm, flexGrow: 1 },
  cartao: {
    backgroundColor: cores.fundoCartao,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espacamento.md,
    gap: espacamento.xs,
  },
  cartaoNaoLido: { borderColor: cores.primaria, backgroundColor: cores.turnoPublicado },

  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: espacamento.sm },
  marcador: { width: 8, height: 8, borderRadius: 4, backgroundColor: cores.primaria },
  titulo: { ...tipografia.corpo, color: cores.texto, flex: 1 },
  tituloNaoLido: { fontWeight: '700' },

  mensagem: { ...tipografia.legenda, color: cores.textoSuave },
  quando: { ...tipografia.micro, color: cores.textoSuave },
});
