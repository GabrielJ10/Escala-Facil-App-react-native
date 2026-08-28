import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { apiFetch, type ErroApi } from '@/nucleo/api';
import { useSessao } from '@/nucleo/sessao';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';
import { formatarData, formatarHora, formatarDiaDaSemana } from '@/contract/format';

/**
 * Minha Escala — a tela onde o funcionário vive.
 *
 * Não é a grade do site. A grade é local × dia com oito colunas: 1080px de largura mínima,
 * três dias visíveis num aparelho de 390px. Aqui é lista por dia, que é como se lê a própria
 * escala no celular.
 *
 * Consome `/users/me/dashboard`, que já devolve resumo, próximos e passados prontos — a tela
 * apresenta um agregado, não monta um.
 */
type Turno = {
  id: string;
  start_timestamp: string;
  end_timestamp: string;
  location?: { name?: string } | null;
  shift_model?: { name?: string } | null;
};

type Painel = {
  next_shift: Turno | null;
  upcoming_shifts: Turno[];
  summary_period?: { total_shifts?: number; total_hours?: number };
};

export default function MinhaEscala() {
  const { sair } = useSessao();

  const consulta = useQuery({
    queryKey: ['me', 'dashboard'],
    queryFn: () => apiFetch<{ data: Painel }>('/users/me/dashboard').then((r) => r.data),
  });

  if (consulta.isLoading) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator size="large" color={cores.primaria} />
      </View>
    );
  }

  const erro = consulta.error as ErroApi | null;

  // 402 é o gestor inadimplente, não o funcionário. Mensagem neutra, sem preço e sem link —
  // ver docs/divergencias-app-web.md e a regra 3.1.3(f) da Apple.
  if (erro?.status === 402) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.aviso}>Indisponível no momento</Text>
        <Text style={estilos.avisoDetalhe}>
          Fale com o gestor da sua equipe para reativar o acesso.
        </Text>
      </View>
    );
  }

  if (erro) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.aviso}>Não foi possível carregar</Text>
        <Text style={estilos.avisoDetalhe}>{erro.message}</Text>
      </View>
    );
  }

  const painel = consulta.data;
  const proximos = painel?.upcoming_shifts ?? [];

  return (
    <ScrollView contentContainerStyle={estilos.tela}>
      <Text style={estilos.titulo}>Minha escala</Text>

      {painel?.next_shift ? (
        <View style={estilos.destaque}>
          <Text style={estilos.destaqueRotulo}>PRÓXIMO TURNO</Text>
          <Text style={estilos.destaqueDia}>
            {formatarDiaDaSemana(painel.next_shift.start_timestamp)}
            {', '}
            {formatarData(painel.next_shift.start_timestamp)}
          </Text>
          <Text style={estilos.destaqueHora}>
            {formatarHora(painel.next_shift.start_timestamp)}
            {' às '}
            {formatarHora(painel.next_shift.end_timestamp)}
          </Text>
          <Text style={estilos.destaqueLocal}>
            {painel.next_shift.location?.name ?? 'Local não informado'}
          </Text>
        </View>
      ) : (
        <View style={estilos.vazio}>
          <Text style={estilos.avisoDetalhe}>Você não tem turnos agendados.</Text>
        </View>
      )}

      {proximos.length > 0 && (
        <>
          <Text style={estilos.secao}>A seguir</Text>
          {proximos.map((t) => (
            <View key={t.id} style={estilos.cartao}>
              <Text style={estilos.cartaoDia}>
                {formatarDiaDaSemana(t.start_timestamp)}, {formatarData(t.start_timestamp)}
              </Text>
              <Text style={estilos.cartaoHora}>
                {formatarHora(t.start_timestamp)} às {formatarHora(t.end_timestamp)}
              </Text>
              <Text style={estilos.cartaoLocal}>{t.location?.name ?? '—'}</Text>
            </View>
          ))}
        </>
      )}

      <Pressable
        style={estilos.rodape}
        onPress={() => router.push('/diagnostico')}
        accessibilityRole="button"
        accessibilityLabel="Abrir diagnóstico"
      >
        <Text style={estilos.rodapeTexto}>Diagnóstico</Text>
      </Pressable>

      <Pressable style={estilos.rodape} onPress={sair} accessibilityRole="button" accessibilityLabel="Sair">
        <Text style={[estilos.rodapeTexto, { color: cores.perigo }]}>Sair</Text>
      </Pressable>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: espacamento.lg, gap: espacamento.sm },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espacamento.lg, gap: espacamento.sm },
  titulo: { ...tipografia.titulo, color: cores.texto, marginBottom: espacamento.sm },
  secao: { ...tipografia.micro, color: cores.textoSuave, textTransform: 'uppercase', marginTop: espacamento.md },

  destaque: {
    backgroundColor: cores.turnoPreenchido,
    borderRadius: raio.lg,
    padding: espacamento.md,
    borderWidth: 1,
    borderColor: cores.sucesso,
  },
  destaqueRotulo: { ...tipografia.micro, color: cores.sucesso },
  destaqueDia: { ...tipografia.subtitulo, color: cores.texto, marginTop: espacamento.xs, textTransform: 'capitalize' },
  destaqueHora: { ...tipografia.titulo, color: cores.texto },
  destaqueLocal: { ...tipografia.corpo, color: cores.textoSuave },

  cartao: {
    backgroundColor: cores.fundoCartao,
    borderRadius: raio.md,
    padding: espacamento.md,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  cartaoDia: { ...tipografia.corpo, color: cores.texto, fontWeight: '600', textTransform: 'capitalize' },
  cartaoHora: { ...tipografia.corpo, color: cores.texto },
  cartaoLocal: { ...tipografia.legenda, color: cores.textoSuave },

  vazio: { padding: espacamento.lg, alignItems: 'center' },
  aviso: { ...tipografia.subtitulo, color: cores.texto },
  avisoDetalhe: { ...tipografia.corpo, color: cores.textoSuave, textAlign: 'center' },

  rodape: { minHeight: TOQUE_MINIMO, alignItems: 'center', justifyContent: 'center', marginTop: espacamento.sm },
  rodapeTexto: { ...tipografia.corpo, color: cores.primaria },
});
