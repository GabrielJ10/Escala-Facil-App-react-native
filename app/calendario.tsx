import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { usePainel } from '@/nucleo/consultas';
import {
  desligarESincronizar,
  pedirPermissao,
  permissaoConcedida,
  sincronizar,
} from '@/nucleo/calendario-do-sistema';
import { hojeNaOrganizacao, somarDias } from '@/nucleo/escala';
import { resolveTenantTimezone } from '@/contract/dateInTimezone';
import { useSessao } from '@/nucleo/sessao';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';

/**
 * Levar a escala para a agenda do celular.
 *
 * É a funcionalidade que só o aplicativo tem — o site não alcança o calendário do sistema —
 * e é ela, junto com push e cache offline, que sustenta a regra 4.2 da Apple: o app faz algo
 * que abrir o site num navegador não faria.
 *
 * Duas decisões que definem a tela:
 *
 * **Nada é automático.** A sincronização acontece quando a pessoa toca, não em segundo
 * plano. Escrever sozinho no calendário de alguém é o tipo de comportamento que faz o app
 * ser desinstalado — e um sync automático que erra escreve o erro em silêncio, num aplicativo
 * que não é o nosso.
 *
 * **Um calendário separado, e um botão para apagá-lo.** Os eventos vão para "Escala Fácil",
 * nunca para a agenda pessoal. Desligar remove tudo de uma vez, e desinstalar o app não
 * deixa lixo espalhado.
 */
const DIAS_SINCRONIZADOS = 60;

export default function Calendario() {
  const { organizacao } = useSessao();
  const fuso = resolveTenantTimezone(organizacao?.settings);

  const painel = usePainel();

  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [ultimoResultado, setUltimoResultado] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    void permissaoConcedida()
      .then((v) => { if (!cancelado) setPermitido(v); })
      .catch(() => { if (!cancelado) setPermitido(false); });
    return () => { cancelado = true; };
  }, []);

  const executar = useCallback(async () => {
    setOcupado(true);
    setUltimoResultado(null);

    try {
      if (!await permissaoConcedida()) {
        const concedida = await pedirPermissao();
        setPermitido(concedida);
        if (!concedida) {
          setUltimoResultado('Sem acesso ao calendário. Você pode liberar nas Configurações.');
          return;
        }
      }

      const hoje = hojeNaOrganizacao(fuso);
      const janela = { inicio: hoje, fim: somarDias(hoje, DIAS_SINCRONIZADOS) };

      // Os turnos vêm do painel, que já traz os próximos prontos. Uma busca a mais só para
      // o calendário seria rede gasta por um dado que já está em cache.
      const turnos = [
        ...(painel.data?.next_shift ? [painel.data.next_shift] : []),
        ...(painel.data?.upcoming_shifts ?? []),
      ];

      const r = await sincronizar(turnos, janela, fuso);

      if (!r.ok) {
        setUltimoResultado(
          r.motivo === 'sem-calendario'
            ? 'Não foi possível criar o calendário Escala Fácil neste aparelho.'
            : 'Não foi possível sincronizar agora. Tente de novo.',
        );
        return;
      }

      setUltimoResultado(
        r.criados + r.atualizados + r.removidos === 0
          ? 'Sua agenda já estava em dia.'
          : `${r.criados} adicionados, ${r.atualizados} atualizados, ${r.removidos} removidos.`,
      );
    } finally {
      setOcupado(false);
    }
  }, [fuso, painel.data]);

  const confirmarDesligar = useCallback(() => {
    Alert.alert(
      'Remover da agenda?',
      'O calendário "Escala Fácil" e todos os turnos que ele contém serão apagados do '
      + 'aparelho. Sua escala no aplicativo não muda.',
      [
        { text: 'Manter', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            setOcupado(true);
            void desligarESincronizar()
              .then(() => setUltimoResultado('Removido da agenda deste aparelho.'))
              .finally(() => setOcupado(false));
          },
        },
      ],
    );
  }, []);

  return (
    <ScrollView contentContainerStyle={estilos.tela}>
      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>Seus turnos na agenda</Text>
        <Text style={estilos.texto}>
          Os próximos {DIAS_SINCRONIZADOS} dias vão para um calendário separado, chamado
          Escala Fácil. Sua agenda pessoal não é alterada.
        </Text>
        <Text style={estilos.nota}>
          A atualização não é automática: toque em sincronizar quando quiser deixar a agenda
          em dia.
        </Text>
      </View>

      {permitido === false ? (
        <Text style={estilos.aviso}>
          O acesso ao calendário ainda não foi liberado neste aparelho.
        </Text>
      ) : null}

      {ultimoResultado ? <Text style={estilos.resultado}>{ultimoResultado}</Text> : null}

      <Pressable
        style={[estilos.principal, (ocupado || painel.isLoading) && estilos.desabilitado]}
        onPress={() => void executar()}
        disabled={ocupado || painel.isLoading}
        accessibilityRole="button"
        accessibilityLabel="Sincronizar com a agenda"
      >
        {ocupado
          ? <ActivityIndicator color={cores.primariaTexto} />
          : <Text style={estilos.principalTexto}>Sincronizar agora</Text>}
      </Pressable>

      <Pressable
        style={[estilos.perigo, ocupado && estilos.desabilitado]}
        onPress={confirmarDesligar}
        disabled={ocupado}
        accessibilityRole="button"
        accessibilityLabel="Remover os turnos da agenda"
      >
        <Text style={estilos.perigoTexto}>Remover da agenda</Text>
      </Pressable>
    </ScrollView>
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
  titulo: { ...tipografia.subtitulo, color: cores.texto },
  texto: { ...tipografia.corpo, color: cores.textoSuave },
  nota: { ...tipografia.legenda, color: cores.textoSuave },
  aviso: { ...tipografia.legenda, color: cores.aviso, textAlign: 'center' },
  resultado: { ...tipografia.corpo, color: cores.texto, textAlign: 'center' },

  principal: {
    minHeight: TOQUE_MINIMO,
    borderRadius: raio.md,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  principalTexto: { ...tipografia.corpo, color: cores.primariaTexto, fontWeight: '600' },
  desabilitado: { opacity: 0.7 },

  perigo: {
    minHeight: TOQUE_MINIMO,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.perigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perigoTexto: { ...tipografia.corpo, color: cores.perigo, fontWeight: '600' },
});
