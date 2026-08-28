import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { useEscala } from '@/nucleo/consultas';
import { agruparTurnosPorDia } from '@/nucleo/apresentacao';
import {
  estaVago,
  hojeNaOrganizacao,
  limitarIntervalo,
  resumoDoDia,
  semanaDe,
  somarDias,
  type TurnoDaEscala,
} from '@/nucleo/escala';
import { resolveTenantTimezone } from '@/contract/dateInTimezone';
import { formatarData, formatarDataCurta, formatarDiaDaSemana, formatarHora } from '@/contract/format';
import { Carregando, Erro, Vazio } from '@/componentes/Estados';
import { usePodeVer, useSessao } from '@/nucleo/sessao';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';

/**
 * A escala, do ponto de vista de quem monta.
 *
 * DIVERGE do site — ver docs/divergencias-app-web.md. Lá é uma grade local × dia: 8 colunas,
 * 1080px de largura mínima, 2.690 linhas de componente. Num aparelho de 390px caberiam três
 * dias, e o gestor passaria a sessão inteira rolando de lado.
 *
 * Aqui é **uma semana, dia a dia, com as vagas na frente**. A pergunta que o gestor faz no
 * celular não é "como está a semana inteira" — para isso ele abre o computador. É "o que está
 * descoberto", e a resposta precisa caber numa tela.
 *
 * Por isso o cabeçalho de cada dia traz a contagem de vagas, e o filtro "só vagas" existe: em
 * trinta turnos por dia, achar os dois buracos rolando é o oposto de montar escala rápido.
 */
export default function Escala() {
  const { organizacao } = useSessao();
  const podeVer = usePodeVer('module_schedule');
  const podeEditar = usePodeVer('action_edit_shifts');

  const fuso = resolveTenantTimezone(organizacao?.settings);

  const [ancora, setAncora] = useState(() => hojeNaOrganizacao(fuso));
  const [soVagas, setSoVagas] = useState(false);

  const intervalo = useMemo(() => limitarIntervalo(semanaDe(ancora)), [ancora]);
  const consulta = useEscala(intervalo, podeVer);

  const dias = useMemo(
    () => agruparTurnosPorDia(consulta.data ?? [], fuso),
    [consulta.data, fuso],
  );

  if (!podeVer) {
    return <Vazio titulo="Sem acesso" detalhe="Esta tela é de quem monta a escala." />;
  }
  if (consulta.isLoading) return <Carregando />;
  if (consulta.error) {
    return <Erro erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />;
  }

  const totalDeVagas = (consulta.data ?? []).filter(estaVago).length;

  return (
    <View style={estilos.tela}>
      <View style={estilos.barra}>
        <Seta rotulo="Semana anterior" texto="‹" onPress={() => setAncora(somarDias(ancora, -7))} />

        <View style={estilos.periodo}>
          <Text style={estilos.periodoTexto}>
            {formatarDataCurta(`${intervalo.inicio}T12:00:00`)}
            {' a '}
            {formatarDataCurta(`${intervalo.fim}T12:00:00`)}
          </Text>
          <Pressable
            onPress={() => setAncora(hojeNaOrganizacao(fuso))}
            accessibilityRole="button"
            accessibilityLabel="Voltar para a semana de hoje"
          >
            <Text style={estilos.hoje}>Hoje</Text>
          </Pressable>
        </View>

        <Seta rotulo="Próxima semana" texto="›" onPress={() => setAncora(somarDias(ancora, 7))} />
      </View>

      <View style={estilos.filtros}>
        <Pressable
          style={[estilos.chip, soVagas && estilos.chipAtivo]}
          onPress={() => setSoVagas((v) => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: soVagas }}
          accessibilityLabel={`Mostrar só as vagas. ${totalDeVagas} nesta semana`}
        >
          <Text style={[estilos.chipTexto, soVagas && estilos.chipTextoAtivo]}>
            Só vagas{totalDeVagas > 0 ? ` (${totalDeVagas})` : ''}
          </Text>
        </Pressable>

        {podeEditar ? (
          <Pressable
            style={estilos.novo}
            onPress={() => router.push({ pathname: '/turno-avulso', params: { dia: ancora } })}
            accessibilityRole="button"
            accessibilityLabel="Criar turno avulso"
          >
            <Text style={estilos.novoTexto}>+ Turno avulso</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={estilos.lista}
        refreshControl={(
          <RefreshControl
            refreshing={consulta.isRefetching}
            onRefresh={() => void consulta.refetch()}
          />
        )}
      >
        {dias.length === 0 ? (
          <Vazio
            titulo="Semana sem turnos"
            detalhe="Nenhum turno gerado para este período."
          />
        ) : null}

        {dias.map(({ dia, turnos }) => (
          <Dia
            key={dia}
            dia={dia}
            turnos={soVagas ? turnos.filter(estaVago) : turnos}
            podeEditar={podeEditar}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Seta({ rotulo, texto, onPress }: Readonly<{
  rotulo: string; texto: string; onPress: () => void;
}>) {
  return (
    <Pressable
      style={estilos.seta}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
    >
      <Text style={estilos.setaTexto}>{texto}</Text>
    </Pressable>
  );
}

function Dia({ dia, turnos, podeEditar }: Readonly<{
  dia: string;
  turnos: TurnoDaEscala[];
  podeEditar: boolean;
}>) {
  const resumo = resumoDoDia(turnos);
  // Meio-dia evita o clássico: "2026-09-01" lido como meia-noite UTC vira 31/08 a oeste.
  const aoMeioDia = `${dia}T12:00:00`;

  if (turnos.length === 0) return null;

  return (
    <View style={estilos.dia}>
      <View style={estilos.diaCabecalho}>
        <Text style={estilos.diaTitulo}>
          {formatarDiaDaSemana(aoMeioDia)}, {formatarData(aoMeioDia)}
        </Text>
        <Text style={[estilos.diaResumo, resumo.vagas > 0 && estilos.diaResumoAlerta]}>
          {resumo.vagas > 0
            ? `${resumo.vagas} ${resumo.vagas === 1 ? 'vaga' : 'vagas'}`
            : 'completo'}
        </Text>
      </View>

      {turnos.map((turno) => (
        <LinhaDaEscala key={turno.id} turno={turno} podeEditar={podeEditar} />
      ))}
    </View>
  );
}

function LinhaDaEscala({ turno, podeEditar }: Readonly<{
  turno: TurnoDaEscala;
  podeEditar: boolean;
}>) {
  const vaga = estaVago(turno);
  const avisos = turno.warnings?.length ?? 0;

  const abrir = () => router.push({ pathname: '/turno/[id]', params: { id: turno.id } });

  return (
    <Pressable
      style={[estilos.linha, vaga && estilos.linhaVaga]}
      onPress={podeEditar ? abrir : undefined}
      disabled={!podeEditar}
      accessibilityRole={podeEditar ? 'button' : 'text'}
      accessibilityLabel={
        `${formatarHora(turno.start_timestamp)} às ${formatarHora(turno.end_timestamp)}, `
        + `${turno.location?.name ?? 'sem local'}, `
        + (vaga ? 'vaga em aberto' : `com ${turno.member?.name ?? 'alguém'}`)
        + (avisos > 0 ? `, ${avisos} aviso` : '')
      }
    >
      <View style={estilos.linhaHora}>
        <Text style={estilos.hora}>{formatarHora(turno.start_timestamp)}</Text>
        <Text style={estilos.horaFim}>{formatarHora(turno.end_timestamp)}</Text>
      </View>

      <View style={estilos.linhaCorpo}>
        <Text style={[estilos.pessoa, vaga && estilos.pessoaVaga]} numberOfLines={1}>
          {vaga ? 'Em aberto' : (turno.member?.name ?? 'Alocado')}
        </Text>
        <Text style={estilos.local} numberOfLines={1}>
          {turno.location?.name ?? '—'}
          {turno.shift_model?.name ? ` · ${turno.shift_model.name}` : ''}
        </Text>
      </View>

      {avisos > 0 ? (
        <View style={estilos.aviso}>
          <Text style={estilos.avisoTexto}>{avisos}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },

  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: espacamento.sm,
    gap: espacamento.sm,
  },
  seta: {
    width: TOQUE_MINIMO,
    height: TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: raio.md,
    backgroundColor: cores.secundaria,
  },
  setaTexto: { fontSize: 22, color: cores.texto, lineHeight: 26 },
  periodo: { flex: 1, alignItems: 'center' },
  periodoTexto: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
  hoje: { ...tipografia.micro, color: cores.primaria, textTransform: 'uppercase' },

  filtros: {
    flexDirection: 'row',
    paddingHorizontal: espacamento.md,
    paddingBottom: espacamento.sm,
    gap: espacamento.sm,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: espacamento.md,
    borderRadius: raio.lg,
    backgroundColor: cores.secundaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipAtivo: { backgroundColor: cores.aviso },
  chipTexto: { ...tipografia.legenda, color: cores.textoSuave, fontWeight: '600' },
  chipTextoAtivo: { color: cores.primariaTexto },
  novo: {
    minHeight: 36,
    flex: 1,
    paddingHorizontal: espacamento.md,
    borderRadius: raio.lg,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  novoTexto: { ...tipografia.legenda, color: cores.primariaTexto, fontWeight: '600' },

  lista: { padding: espacamento.md, paddingTop: 0, gap: espacamento.md, flexGrow: 1 },

  dia: { gap: espacamento.xs },
  diaCabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: espacamento.xs,
  },
  diaTitulo: {
    ...tipografia.legenda,
    color: cores.texto,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  diaResumo: { ...tipografia.micro, color: cores.textoSuave, textTransform: 'uppercase' },
  diaResumoAlerta: { color: cores.aviso },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    minHeight: 64,
    paddingHorizontal: espacamento.md,
    backgroundColor: cores.fundoCartao,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  linhaVaga: { borderColor: cores.aviso, borderStyle: 'dashed' },

  linhaHora: { width: 52 },
  hora: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
  horaFim: { ...tipografia.micro, color: cores.textoSuave },

  linhaCorpo: { flex: 1, gap: 2 },
  pessoa: { ...tipografia.corpo, color: cores.texto },
  pessoaVaga: { color: cores.aviso, fontWeight: '600' },
  local: { ...tipografia.legenda, color: cores.textoSuave },

  aviso: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: cores.aviso,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avisoTexto: { ...tipografia.micro, color: cores.primariaTexto, fontWeight: '700' },
});
