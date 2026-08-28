import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import {
  useAlocarMembro,
  useDesalocarMembro,
  useEscala,
  useMembros,
  type Membro,
} from '@/nucleo/consultas';
import {
  estaVago,
  hojeNaOrganizacao,
  limitarIntervalo,
  semanaDe,
  type TurnoDaEscala,
} from '@/nucleo/escala';
import { resolveTenantTimezone } from '@/contract/dateInTimezone';
import { ordenarNomes, formatarData, formatarDiaDaSemana, formatarHora } from '@/contract/format';
import { Carregando, Erro, FaixaDeErro, Vazio } from '@/componentes/Estados';
import { usePodeVer, useSessao } from '@/nucleo/sessao';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';

/**
 * Um turno, e o que dá para fazer com ele no celular: alocar e desalocar.
 *
 * DIVERGE do site — ver docs/divergencias-app-web.md. Lá isso é arrastar e soltar na grade.
 * Arrastar num celular exige gesto de primeira classe e uma tela que não cabe; a mesma
 * operação, aqui, é escolher da lista.
 *
 * O turno vem do cache da escala, não de uma rota própria: `GET /shifts/:id` não existe, e a
 * semana já foi buscada para a tela anterior. Quem chega por link direto paga uma busca da
 * semana — o mesmo que a tela de escala pagaria.
 */
export default function DetalheDoTurno() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { organizacao } = useSessao();
  const podeEditar = usePodeVer('action_edit_shifts');
  const podeVerMembros = usePodeVer('module_employees');

  const fuso = resolveTenantTimezone(organizacao?.settings);
  const intervalo = useMemo(
    () => limitarIntervalo(semanaDe(hojeNaOrganizacao(fuso))),
    [fuso],
  );

  const escala = useEscala(intervalo);
  const turno = (escala.data ?? []).find((t) => t.id === id) ?? null;

  if (escala.isLoading) return <Carregando />;
  if (escala.error) return <Erro erro={escala.error} aoTentarDeNovo={() => void escala.refetch()} />;

  if (!turno) {
    return (
      <Vazio
        titulo="Turno não encontrado"
        detalhe="Ele pode ter sido removido, ou estar fora da semana atual."
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.tela}>
      <Cabecalho turno={turno} />

      {podeEditar ? (
        <Alocacao turno={turno} podeVerMembros={podeVerMembros} />
      ) : (
        <Text style={estilos.aviso}>Você não tem permissão para alterar alocações.</Text>
      )}
    </ScrollView>
  );
}

function Cabecalho({ turno }: Readonly<{ turno: TurnoDaEscala }>) {
  return (
    <View style={estilos.cartao}>
      <Text style={estilos.dia}>
        {formatarDiaDaSemana(turno.start_timestamp)}, {formatarData(turno.start_timestamp)}
      </Text>
      <Text style={estilos.hora}>
        {formatarHora(turno.start_timestamp)} às {formatarHora(turno.end_timestamp)}
      </Text>
      <Text style={estilos.local}>{turno.location?.name ?? 'Local não informado'}</Text>
      {turno.shift_model?.name ? (
        <Text style={estilos.modelo}>{turno.shift_model.name}</Text>
      ) : null}
      {turno.required_role ? (
        <Text style={estilos.cargo}>Cargo exigido: {turno.required_role}</Text>
      ) : null}

      {(turno.warnings?.length ?? 0) > 0 ? (
        <View style={estilos.avisos}>
          <Text style={estilos.avisosTitulo}>
            {turno.warnings!.length === 1 ? '1 aviso' : `${turno.warnings!.length} avisos`}
          </Text>
          {turno.warnings!.map((a, i) => (
            <Text key={`${a.code}-${i}`} style={estilos.avisoItem}>{a.code ?? 'aviso'}</Text>
          ))}
          <Text style={estilos.avisosNota}>
            O detalhe de cada aviso está na escala, no computador.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Alocacao({ turno, podeVerMembros }: Readonly<{
  turno: TurnoDaEscala;
  podeVerMembros: boolean;
}>) {
  const [busca, setBusca] = useState('');
  const membros = useMembros(podeVerMembros);
  const alocar = useAlocarMembro();
  const desalocar = useDesalocarMembro();

  const candidatos = useMemo(() => {
    const ativos = (membros.data ?? []).filter((m) => !m.status || m.status === 'ACTIVE');
    const termo = busca.trim().toLowerCase();
    const filtrados = termo
      ? ativos.filter((m) => m.name?.toLowerCase().includes(termo))
      : ativos;
    // A ordenação vem do contrato: "Ávila" antes de "Bastos", que `sort()` cru erraria.
    return ordenarNomes(filtrados, (m) => m.name ?? '');
  }, [membros.data, busca]);

  /**
   * Desalocar é destrutivo e silencioso — o turno volta a ser vaga e ninguém é avisado na
   * hora. Confirmar é barato; descobrir depois que o turno de sábado ficou descoberto, não.
   */
  const confirmarSaida = () => {
    Alert.alert(
      'Tirar da escala?',
      `${turno.member?.name ?? 'A pessoa'} sai deste turno, e ele volta a ficar em aberto.`,
      [
        { text: 'Manter', style: 'cancel' },
        {
          text: 'Tirar',
          style: 'destructive',
          onPress: () => desalocar.mutate(turno.id, { onSuccess: () => router.back() }),
        },
      ],
    );
  };

  if (!estaVago(turno)) {
    return (
      <View style={estilos.cartao}>
        <Text style={estilos.secao}>Alocado</Text>
        <Text style={estilos.pessoa}>{turno.member?.name ?? 'Alguém da equipe'}</Text>

        {desalocar.error ? <FaixaDeErro erro={desalocar.error} /> : null}

        <Pressable
          style={[estilos.perigo, desalocar.isPending && estilos.desabilitado]}
          onPress={confirmarSaida}
          disabled={desalocar.isPending}
          accessibilityRole="button"
          accessibilityLabel="Tirar da escala"
        >
          {desalocar.isPending
            ? <ActivityIndicator color={cores.perigo} />
            : <Text style={estilos.perigoTexto}>Tirar da escala</Text>}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={estilos.cartao}>
      <Text style={estilos.secao}>Alocar alguém</Text>

      {!podeVerMembros ? (
        <Text style={estilos.aviso}>Você não tem permissão para ver a equipe.</Text>
      ) : null}

      {membros.isLoading ? <ActivityIndicator color={cores.primaria} /> : null}

      {podeVerMembros && !membros.isLoading ? (
        <>
          <TextInput
            style={estilos.busca}
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar pelo nome"
            placeholderTextColor={cores.textoSuave}
            autoCorrect={false}
            accessibilityLabel="Buscar pessoa pelo nome"
          />

          {alocar.error ? <FaixaDeErro erro={alocar.error} /> : null}

          {candidatos.length === 0 ? (
            <Text style={estilos.aviso}>Ninguém encontrado com esse nome.</Text>
          ) : null}

          {candidatos.map((membro) => (
            <Candidato
              key={membro.id}
              membro={membro}
              ocupado={alocar.isPending && alocar.variables?.membroId === membro.id}
              desabilitado={alocar.isPending}
              onPress={() => alocar.mutate(
                { turnoId: turno.id, membroId: membro.id },
                { onSuccess: () => router.back() },
              )}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}

function Candidato({ membro, ocupado, desabilitado, onPress }: Readonly<{
  membro: Membro;
  ocupado: boolean;
  desabilitado: boolean;
  onPress: () => void;
}>) {
  return (
    <Pressable
      style={[estilos.candidato, desabilitado && estilos.desabilitado]}
      onPress={onPress}
      disabled={desabilitado}
      accessibilityRole="button"
      accessibilityLabel={`Alocar ${membro.name}`}
    >
      <Text style={estilos.candidatoNome} numberOfLines={1}>{membro.name}</Text>
      {ocupado ? <ActivityIndicator color={cores.primaria} /> : null}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: espacamento.md, gap: espacamento.md },

  cartao: {
    backgroundColor: cores.fundoCartao,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espacamento.md,
    gap: espacamento.sm,
  },
  dia: { ...tipografia.subtitulo, color: cores.texto, textTransform: 'capitalize' },
  hora: { ...tipografia.titulo, color: cores.texto },
  local: { ...tipografia.corpo, color: cores.textoSuave },
  modelo: { ...tipografia.legenda, color: cores.textoSuave },
  cargo: { ...tipografia.legenda, color: cores.textoSuave },

  avisos: {
    marginTop: espacamento.xs,
    padding: espacamento.sm,
    borderRadius: raio.sm,
    backgroundColor: cores.turnoBloqueado,
    gap: 2,
  },
  avisosTitulo: { ...tipografia.legenda, color: cores.aviso, fontWeight: '700' },
  avisoItem: { ...tipografia.micro, color: cores.texto },
  avisosNota: { ...tipografia.micro, color: cores.textoSuave, marginTop: espacamento.xs },

  secao: { ...tipografia.micro, color: cores.textoSuave, textTransform: 'uppercase' },
  pessoa: { ...tipografia.subtitulo, color: cores.texto },
  aviso: { ...tipografia.legenda, color: cores.textoSuave },

  busca: {
    minHeight: TOQUE_MINIMO,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.sm,
    paddingHorizontal: espacamento.sm,
    color: cores.texto,
    backgroundColor: cores.fundo,
    ...tipografia.corpo,
  },
  candidato: {
    minHeight: TOQUE_MINIMO,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacamento.sm,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.sm,
    backgroundColor: cores.fundo,
  },
  candidatoNome: { ...tipografia.corpo, color: cores.texto, flex: 1 },

  desabilitado: { opacity: 0.6 },
  perigo: {
    minHeight: TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.perigo,
  },
  perigoTexto: { ...tipografia.corpo, color: cores.perigo, fontWeight: '600' },
});
