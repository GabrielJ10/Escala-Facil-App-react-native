import type { ReactNode } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { usePortaoDeVersao } from '@/nucleo/consultas';
import { avaliarVersao } from '@/nucleo/versao';
import { VERSAO_APP } from '@/nucleo/ambiente';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';

/**
 * Bloqueia o app quando a versão instalada é velha demais para falar com o servidor.
 *
 * Envolve o app inteiro, e por isso a regra mais importante aqui é **falhar aberto**: sem
 * resposta do servidor, com resposta ilegível, ou com a consulta ainda em voo, as crianças
 * renderizam normalmente. Um portão que tranca porque não conseguiu perguntar se pode
 * destravar é o pior desfecho possível — deixaria o app inutilizável durante qualquer queda
 * da API, inclusive para quem está na versão mais nova.
 *
 * Só o veredicto `bloqueado` interrompe. `atualizacao-sugerida` é deliberadamente silencioso
 * nesta camada: um aviso sobre o app inteiro, toda abertura, vira ruído que se aprende a
 * fechar sem ler. Ele aparece no perfil, onde a pessoa está olhando para o app em si.
 */
export function PortaoDeVersao({ children }: Readonly<{ children: ReactNode }>) {
  const portao = usePortaoDeVersao();
  const veredicto = avaliarVersao(VERSAO_APP, portao.data);

  if (veredicto !== 'bloqueado') return <>{children}</>;

  const loja = Platform.OS === 'ios'
    ? portao.data?.store_url?.ios
    : portao.data?.store_url?.android;

  return (
    <View style={estilos.tela}>
      <Text style={estilos.titulo}>Atualize o aplicativo</Text>

      <Text style={estilos.texto}>
        {portao.data?.message || 'Uma versão mais nova do aplicativo está disponível.'}
      </Text>

      <Text style={estilos.nota}>
        Você está na versão {VERSAO_APP}. A mínima é a {portao.data?.minimum}.
      </Text>

      {loja ? (
        <Pressable
          style={estilos.botao}
          onPress={() => void Linking.openURL(loja)}
          accessibilityRole="button"
          accessibilityLabel="Abrir a loja para atualizar"
        >
          <Text style={estilos.botaoTexto}>Atualizar agora</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espacamento.lg,
    gap: espacamento.md,
    backgroundColor: cores.fundo,
  },
  titulo: { ...tipografia.titulo, color: cores.texto, textAlign: 'center' },
  texto: { ...tipografia.corpo, color: cores.textoSuave, textAlign: 'center' },
  nota: { ...tipografia.legenda, color: cores.textoSuave, textAlign: 'center' },
  botao: {
    minHeight: TOQUE_MINIMO,
    paddingHorizontal: espacamento.xl,
    borderRadius: raio.md,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: espacamento.sm,
  },
  botaoTexto: { ...tipografia.corpo, color: cores.primariaTexto, fontWeight: '600' },
});
