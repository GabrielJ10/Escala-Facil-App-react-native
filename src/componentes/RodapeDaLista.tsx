import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { cores, espacamento, tipografia } from '@/nucleo/tema';

/**
 * O rodapé de uma lista que carrega mais ao rolar.
 *
 * Existe porque a alternativa é pior do que parece: sem sinal nenhum, a lista simplesmente
 * para de crescer, e quem procura uma troca pendente conclui que ela não existe. Era esse o
 * defeito antes de haver paginação — a lista cortava no vigésimo item em silêncio.
 *
 * Quando não há mais nada, o rodapé some em vez de dizer "acabou": num celular, chegar ao fim
 * da rolagem já comunica isso, e uma linha a mais só ocuparia a tela.
 */
export function RodapeDaLista({ carregando }: Readonly<{ carregando?: boolean }>) {
  if (!carregando) return null;

  return (
    <View style={estilos.rodape}>
      <ActivityIndicator color={cores.textoSuave} />
      <Text style={estilos.texto}>Carregando mais…</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  rodape: {
    paddingVertical: espacamento.lg,
    alignItems: 'center',
    gap: espacamento.sm,
  },
  texto: { ...tipografia.legenda, color: cores.textoSuave },
});
