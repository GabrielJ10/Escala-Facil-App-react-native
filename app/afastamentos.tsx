import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  useAfastamentosMeus,
  usePedirAfastamento,
  type Afastamento,
  type SituacaoDeAfastamento,
} from '@/nucleo/consultas';
import { rotuloDaSituacaoDoAfastamento, validarPedidoDeAfastamento } from '@/nucleo/apresentacao';
import { Carregando, Erro, FaixaDeErro, Vazio } from '@/componentes/Estados';
import { CarregarMais } from '@/componentes/CarregarMais';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';
import { formatarData } from '@/contract/format';

/**
 * Afastamentos — do ponto de vista de quem pede.
 *
 * DIVERGE do site — ver docs/divergencias-app-web.md. A `AfastamentosPage` tem 1.187 linhas
 * e é tela de GESTOR: aprova, recusa, edita, apaga, e exige `module_absences`
 * (OWNER/ADMIN). O funcionário alcança `action_create_absence_request` e nada mais.
 *
 * Então esta tela é uma fração daquela de propósito: pedir, e acompanhar o que foi pedido.
 * Trazer a tela do gestor para cá daria uma tela que a maioria dos usuários do app não tem
 * permissão de usar.
 *
 * O filtro por situação existe porque o backend obriga: `listRequestsQuerySchema` tem
 * `.default('PENDING_ADMIN_APPROVAL')`, então não existe "trazer tudo" numa chamada só.
 */
const SITUACOES: Array<{ valor: SituacaoDeAfastamento; rotulo: string }> = [
  { valor: 'PENDING_ADMIN_APPROVAL', rotulo: 'Em análise' },
  { valor: 'APPROVED', rotulo: 'Aprovados' },
  { valor: 'REJECTED', rotulo: 'Recusados' },
  { valor: 'CANCELLED', rotulo: 'Cancelados' },
];

export default function Afastamentos() {
  const [situacao, setSituacao] = useState<SituacaoDeAfastamento>('PENDING_ADMIN_APPROVAL');
  const [formularioAberto, setFormularioAberto] = useState(false);

  const lista = useAfastamentosMeus(situacao);

  return (
    <KeyboardAvoidingView
      style={estilos.tela}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={estilos.conteudo}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl refreshing={lista.isRefetching} onRefresh={() => void lista.refetch()} />
        )}
      >
        {formularioAberto ? (
          <Formulario aoFechar={() => setFormularioAberto(false)} />
        ) : (
          <Pressable
            style={estilos.botaoPrincipal}
            onPress={() => setFormularioAberto(true)}
            accessibilityRole="button"
            accessibilityLabel="Pedir afastamento"
          >
            <Text style={estilos.botaoPrincipalTexto}>Pedir afastamento</Text>
          </Pressable>
        )}

        <View style={estilos.filtros}>
          {SITUACOES.map(({ valor, rotulo }) => (
            <Pressable
              key={valor}
              style={[estilos.chip, situacao === valor && estilos.chipAtivo]}
              onPress={() => setSituacao(valor)}
              accessibilityRole="tab"
              accessibilityState={{ selected: situacao === valor }}
              accessibilityLabel={rotulo}
            >
              <Text style={[estilos.chipTexto, situacao === valor && estilos.chipTextoAtivo]}>
                {rotulo}
              </Text>
            </Pressable>
          ))}
        </View>

        <ListaDePedidos consulta={lista} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type ConsultaDeLista = ReturnType<typeof useAfastamentosMeus>;

function ListaDePedidos({ consulta }: Readonly<{ consulta: ConsultaDeLista }>) {
  if (consulta.isLoading) return <Carregando />;
  if (consulta.error) {
    return <Erro erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />;
  }

  const itens = consulta.data ?? [];
  if (itens.length === 0) {
    return <Vazio titulo="Nenhum pedido aqui" detalhe="Nada com esta situação no momento." />;
  }

  return (
    <>
      {itens.map((pedido) => <CartaoPedido key={pedido.id} pedido={pedido} />)}
      <CarregarMais
        temMais={consulta.temMais}
        carregando={consulta.carregandoMais}
        aoTocar={consulta.carregarMais}
      />
    </>
  );
}

function CartaoPedido({ pedido }: Readonly<{ pedido: Afastamento }>) {
  // As datas vêm como AAAA-MM-DD puro, sem hora. Concatenar T12:00 antes de formatar evita o
  // clássico: interpretado como meia-noite UTC, um dia 10 vira 9 para quem está em UTC-3.
  const aoMeioDia = (dia: string) => `${String(dia).slice(0, 10)}T12:00:00`;

  return (
    <View style={estilos.cartao}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.periodo}>
          {formatarData(aoMeioDia(pedido.start_date))} a {formatarData(aoMeioDia(pedido.end_date))}
        </Text>
        <Text style={estilos.situacaoTexto}>{rotuloDaSituacaoDoAfastamento(pedido.status)}</Text>
      </View>

      <Text style={estilos.motivo}>{pedido.reason}</Text>

      {pedido.review_reason ? (
        <Text style={estilos.resposta}>Resposta do gestor: {pedido.review_reason}</Text>
      ) : null}
    </View>
  );
}

/**
 * O formulário de pedido.
 *
 * As datas são digitadas em AAAA-MM-DD em vez de escolhidas num calendário. É uma decisão
 * consciente para a v1: um seletor de datas nativo é mais uma dependência com comportamento
 * diferente nas duas plataformas, e a validação já existe e tem teste. Trocar por seletor é
 * melhoria de conforto, não de correção — e está registrada como pendência.
 */
function Formulario({ aoFechar }: Readonly<{ aoFechar: () => void }>) {
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);

  const pedir = usePedirAfastamento();
  const erros = validarPedidoDeAfastamento({ inicio, fim, motivo });

  const enviar = () => {
    setTentou(true);
    if (erros.length > 0) return;

    pedir.mutate(
      { start_date: inicio, end_date: fim, reason: motivo.trim() },
      { onSuccess: aoFechar },
    );
  };

  return (
    <View style={estilos.formulario}>
      <Text style={estilos.formularioTitulo}>Pedir afastamento</Text>

      <Campo
        rotulo="Primeiro dia"
        valor={inicio}
        aoMudar={setInicio}
        exemplo="2026-09-01"
      />
      <Campo
        rotulo="Último dia"
        valor={fim}
        aoMudar={setFim}
        exemplo="2026-09-05"
      />

      <Text style={estilos.rotulo}>Motivo</Text>
      <TextInput
        style={[estilos.entrada, estilos.entradaLonga]}
        value={motivo}
        onChangeText={setMotivo}
        placeholder="Consulta médica, viagem, etc."
        placeholderTextColor={cores.textoSuave}
        multiline
        accessibilityLabel="Motivo do afastamento"
      />

      {tentou && erros.length > 0 ? (
        <View style={estilos.erros}>
          {erros.map((erro) => <Text key={erro} style={estilos.erroTexto}>{erro}</Text>)}
        </View>
      ) : null}

      {pedir.error ? <FaixaDeErro erro={pedir.error} /> : null}

      <View style={estilos.acoes}>
        <Pressable
          style={[estilos.acao, estilos.acaoSecundaria]}
          onPress={aoFechar}
          disabled={pedir.isPending}
          accessibilityRole="button"
          accessibilityLabel="Cancelar"
        >
          <Text style={estilos.acaoSecundariaTexto}>Cancelar</Text>
        </Pressable>

        <Pressable
          style={[estilos.acao, estilos.acaoPrincipal, pedir.isPending && estilos.desabilitado]}
          onPress={enviar}
          disabled={pedir.isPending}
          accessibilityRole="button"
          accessibilityLabel="Enviar pedido"
        >
          {pedir.isPending
            ? <ActivityIndicator color={cores.primariaTexto} />
            : <Text style={estilos.acaoPrincipalTexto}>Enviar</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function Campo({ rotulo, valor, aoMudar, exemplo }: Readonly<{
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  exemplo: string;
}>) {
  return (
    <>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        style={estilos.entrada}
        value={valor}
        onChangeText={aoMudar}
        placeholder={exemplo}
        placeholderTextColor={cores.textoSuave}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
        accessibilityLabel={`${rotulo}, no formato ano, mês, dia`}
      />
    </>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espacamento.md, gap: espacamento.md, flexGrow: 1 },

  botaoPrincipal: {
    minHeight: TOQUE_MINIMO,
    borderRadius: raio.md,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoPrincipalTexto: { ...tipografia.corpo, color: cores.primariaTexto, fontWeight: '600' },

  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm },
  chip: {
    minHeight: 36,
    paddingHorizontal: espacamento.md,
    borderRadius: raio.lg,
    backgroundColor: cores.secundaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipAtivo: { backgroundColor: cores.primaria },
  chipTexto: { ...tipografia.legenda, color: cores.textoSuave, fontWeight: '600' },
  chipTextoAtivo: { color: cores.primariaTexto },

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
  periodo: { ...tipografia.corpo, color: cores.texto, fontWeight: '600', flex: 1 },
  situacaoTexto: { ...tipografia.micro, color: cores.textoSuave, textTransform: 'uppercase' },
  motivo: { ...tipografia.legenda, color: cores.textoSuave },
  resposta: { ...tipografia.legenda, color: cores.texto, fontStyle: 'italic' },

  formulario: {
    backgroundColor: cores.fundoCartao,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espacamento.md,
    gap: espacamento.sm,
  },
  formularioTitulo: { ...tipografia.subtitulo, color: cores.texto },
  rotulo: { ...tipografia.micro, color: cores.textoSuave, textTransform: 'uppercase' },
  entrada: {
    minHeight: TOQUE_MINIMO,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.sm,
    paddingHorizontal: espacamento.sm,
    color: cores.texto,
    backgroundColor: cores.fundo,
    ...tipografia.corpo,
  },
  entradaLonga: { minHeight: 88, paddingTop: espacamento.sm, textAlignVertical: 'top' },

  erros: { gap: 2 },
  erroTexto: { ...tipografia.legenda, color: cores.perigo },

  acoes: { flexDirection: 'row', gap: espacamento.sm, marginTop: espacamento.xs },
  acao: {
    flex: 1,
    minHeight: TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: raio.md,
  },
  desabilitado: { opacity: 0.7 },
  acaoPrincipal: { backgroundColor: cores.primaria },
  acaoPrincipalTexto: { ...tipografia.corpo, color: cores.primariaTexto, fontWeight: '600' },
  acaoSecundaria: { backgroundColor: cores.secundaria },
  acaoSecundariaTexto: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
});
