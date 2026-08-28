import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import {
  useCriarTurnoAvulso,
  useLocais,
  useModelosDeTurno,
  type ModeloDeTurno,
} from '@/nucleo/consultas';
import {
  corpoDoTurnoAvulso,
  hojeNaOrganizacao,
  instanteNaOrganizacao,
  validarTurnoAvulso,
} from '@/nucleo/escala';
import { resolveTenantTimezone } from '@/contract/dateInTimezone';
import { formatarData, formatarHora } from '@/contract/format';
import { Carregando, Erro, FaixaDeErro, Vazio } from '@/componentes/Estados';
import { usePodeVer, useSessao } from '@/nucleo/sessao';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';

/**
 * Criar turno avulso — a forma de montar escala pelo celular.
 *
 * É a mesma primitiva do plano MANUAL no site: uma caixinha pontual, sem criar regra de
 * cobertura. O backend a marca com `origin: 'ADHOC_MANUAL'`, e ela sobrevive ao re-sync que
 * apaga rascunhos sem regra (`SURVIVES_RESYNC_ORIGINS`).
 *
 * Duas escolhas que mudam o que a tela pede:
 *
 * **A hora vem do modelo, não do gestor.** O modelo já traz `start_time` e
 * `duration_minutes`; escolher o modelo é escolher o horário. Deixar o gestor digitar hora e
 * duração livres criaria turnos que não batem com nenhum modelo — e a escala inteira do
 * produto é montada sobre modelos.
 *
 * **O horário é construído no fuso da ORGANIZAÇÃO.** `new Date('2026-09-01T08:00')` usaria o
 * fuso do aparelho: um gestor viajando criaria turnos horas fora do que viu na tela, e a
 * diferença só apareceria para quem fosse trabalhar. `instanteNaOrganizacao` resolve isso, e
 * tem teste.
 */
export default function TurnoAvulso() {
  const { dia: diaInicial } = useLocalSearchParams<{ dia?: string }>();
  const { organizacao } = useSessao();
  const podeCriar = usePodeVer('action_edit_shifts');

  const fuso = resolveTenantTimezone(organizacao?.settings);

  const [dia, setDia] = useState(() => diaInicial || hojeNaOrganizacao(fuso));
  const [localId, setLocalId] = useState<string | null>(null);
  const [modeloId, setModeloId] = useState<string | null>(null);
  const [tentou, setTentou] = useState(false);

  const locais = useLocais(podeCriar);
  const modelos = useModelosDeTurno(podeCriar);
  const criar = useCriarTurnoAvulso();

  const modelosUsaveis = useMemo(
    () => (modelos.data ?? []).filter((m) => !m.is_ended && m.start_time && m.duration_minutes),
    [modelos.data],
  );

  const modelo = modelosUsaveis.find((m) => m.id === modeloId) ?? null;

  const rascunho = {
    dia,
    hora: (modelo?.start_time ?? '').slice(0, 5),
    duracaoMinutos: modelo?.duration_minutes ?? 0,
    localId,
    modeloId,
  };

  const erros = validarTurnoAvulso(rascunho);

  const enviar = () => {
    setTentou(true);
    const corpo = corpoDoTurnoAvulso(rascunho, fuso);
    if (!corpo) return;

    criar.mutate(corpo, { onSuccess: () => router.back() });
  };

  if (!podeCriar) {
    return <Vazio titulo="Sem acesso" detalhe="Criar turno é de quem monta a escala." />;
  }
  if (locais.isLoading || modelos.isLoading) return <Carregando />;

  const erroDeCarga = locais.error ?? modelos.error;
  if (erroDeCarga) {
    return (
      <Erro
        erro={erroDeCarga}
        aoTentarDeNovo={() => {
          void locais.refetch();
          void modelos.refetch();
        }}
      />
    );
  }

  const locaisAtivos = (locais.data ?? []).filter((l) => l.is_active !== false);

  return (
    <KeyboardAvoidingView
      style={estilos.tela}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.rotulo}>Dia</Text>
        <TextInput
          style={estilos.entrada}
          value={dia}
          onChangeText={setDia}
          placeholder="2026-09-01"
          placeholderTextColor={cores.textoSuave}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel="Dia do turno, no formato ano, mês, dia"
        />

        <Text style={estilos.rotulo}>Local</Text>
        {locaisAtivos.length === 0 ? (
          <Text style={estilos.vazio}>Nenhum local cadastrado.</Text>
        ) : null}
        {locaisAtivos.map((local) => (
          <Opcao
            key={local.id}
            titulo={local.name}
            escolhida={localId === local.id}
            onPress={() => setLocalId(local.id)}
          />
        ))}

        <Text style={estilos.rotulo}>Modelo de turno</Text>
        {modelosUsaveis.length === 0 ? (
          <Text style={estilos.vazio}>
            Nenhum modelo ativo com horário definido. Cadastre um no computador.
          </Text>
        ) : null}
        {modelosUsaveis.map((m) => (
          <Opcao
            key={m.id}
            titulo={m.name}
            detalhe={descreverModelo(m)}
            escolhida={modeloId === m.id}
            onPress={() => setModeloId(m.id)}
          />
        ))}

        {modelo ? <Previsao dia={dia} modelo={modelo} fuso={fuso} /> : null}

        {tentou && erros.length > 0 ? (
          <View style={estilos.erros}>
            {erros.map((erro) => <Text key={erro} style={estilos.erroTexto}>{erro}</Text>)}
          </View>
        ) : null}

        {criar.error ? <FaixaDeErro erro={criar.error} /> : null}

        <Pressable
          style={[estilos.principal, criar.isPending && estilos.desabilitado]}
          onPress={enviar}
          disabled={criar.isPending}
          accessibilityRole="button"
          accessibilityLabel="Criar turno"
        >
          {criar.isPending
            ? <ActivityIndicator color={cores.primariaTexto} />
            : <Text style={estilos.principalTexto}>Criar turno</Text>}
        </Pressable>

        <Text style={estilos.nota}>
          O turno nasce em aberto. Para alocar alguém, toque nele na escala.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function descreverModelo(modelo: ModeloDeTurno): string {
  const horas = Math.floor((modelo.duration_minutes ?? 0) / 60);
  const minutos = (modelo.duration_minutes ?? 0) % 60;
  const duracao = minutos > 0 ? `${horas}h${String(minutos).padStart(2, '0')}` : `${horas}h`;
  return `${(modelo.start_time ?? '').slice(0, 5)} · ${duracao}`;
}

/**
 * O que vai ser criado, em português.
 *
 * Existe porque o gestor escolhe dia e modelo separados, e o resultado — principalmente num
 * turno noturno que atravessa a meia-noite — não é óbvio a partir das duas escolhas.
 */
function Previsao({ dia, modelo, fuso }: Readonly<{
  dia: string;
  modelo: ModeloDeTurno;
  fuso: string;
}>) {
  const inicio = instanteNaOrganizacao(dia, (modelo.start_time ?? '').slice(0, 5), fuso);
  if (!inicio) return null;

  const fim = new Date(inicio.getTime() + (modelo.duration_minutes ?? 0) * 60_000);
  const viraODia = fim.toISOString().slice(0, 10) !== inicio.toISOString().slice(0, 10);

  return (
    <View style={estilos.previsao}>
      <Text style={estilos.previsaoRotulo}>VAI CRIAR</Text>
      <Text style={estilos.previsaoTexto}>
        {formatarData(inicio)} · {formatarHora(inicio)} às {formatarHora(fim)}
      </Text>
      {viraODia ? (
        <Text style={estilos.previsaoNota}>Este turno termina no dia seguinte.</Text>
      ) : null}
    </View>
  );
}

function Opcao({ titulo, detalhe, escolhida, onPress }: Readonly<{
  titulo: string;
  detalhe?: string;
  escolhida: boolean;
  onPress: () => void;
}>) {
  return (
    <Pressable
      style={[estilos.opcao, escolhida && estilos.opcaoEscolhida]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: escolhida }}
      accessibilityLabel={detalhe ? `${titulo}, ${detalhe}` : titulo}
    >
      <View style={estilos.opcaoTextos}>
        <Text style={[estilos.opcaoTitulo, escolhida && estilos.opcaoTituloEscolhido]}>
          {titulo}
        </Text>
        {detalhe ? <Text style={estilos.opcaoDetalhe}>{detalhe}</Text> : null}
      </View>
      {escolhida ? <View style={estilos.marcador} /> : null}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: espacamento.md, gap: espacamento.sm },

  rotulo: {
    ...tipografia.micro,
    color: cores.textoSuave,
    textTransform: 'uppercase',
    marginTop: espacamento.sm,
  },
  entrada: {
    minHeight: TOQUE_MINIMO,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.sm,
    paddingHorizontal: espacamento.sm,
    color: cores.texto,
    backgroundColor: cores.fundoCartao,
    ...tipografia.corpo,
  },
  vazio: { ...tipografia.legenda, color: cores.textoSuave },

  opcao: {
    minHeight: TOQUE_MINIMO,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingHorizontal: espacamento.md,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.fundoCartao,
  },
  opcaoEscolhida: { borderColor: cores.primaria, backgroundColor: cores.turnoPublicado },
  opcaoTextos: { flex: 1 },
  opcaoTitulo: { ...tipografia.corpo, color: cores.texto },
  opcaoTituloEscolhido: { fontWeight: '700' },
  opcaoDetalhe: { ...tipografia.legenda, color: cores.textoSuave },
  marcador: { width: 10, height: 10, borderRadius: 5, backgroundColor: cores.primaria },

  previsao: {
    marginTop: espacamento.md,
    padding: espacamento.md,
    borderRadius: raio.md,
    backgroundColor: cores.turnoPreenchido,
    borderWidth: 1,
    borderColor: cores.sucesso,
    gap: 2,
  },
  previsaoRotulo: { ...tipografia.micro, color: cores.sucesso },
  previsaoTexto: { ...tipografia.subtitulo, color: cores.texto },
  previsaoNota: { ...tipografia.legenda, color: cores.textoSuave },

  erros: { gap: 2, marginTop: espacamento.sm },
  erroTexto: { ...tipografia.legenda, color: cores.perigo },

  principal: {
    minHeight: TOQUE_MINIMO,
    marginTop: espacamento.md,
    borderRadius: raio.md,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desabilitado: { opacity: 0.7 },
  principalTexto: { ...tipografia.corpo, color: cores.primariaTexto, fontWeight: '600' },
  nota: { ...tipografia.legenda, color: cores.textoSuave, textAlign: 'center' },
});
