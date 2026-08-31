import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';

/**
 * Botão de carregar a próxima página, para as listas que não podem virar `FlatList`.
 *
 * A rolagem infinita é melhor e é o que `trocas` e `notificações` usam. Mas duas telas têm
 * lista dentro de um `ScrollView` com outras coisas em volta — o formulário de pedido em
 * `afastamentos`, e duas listas na mesma rolagem em `solicitações`. Aninhar `FlatList` em
 * `ScrollView` quebra a virtualização e o React Native avisa em tempo de execução; com duas
 * listas, nenhuma das duas poderia dizer sozinha que chegou ao fim.
 *
 * Então o botão. É explícito, funciona em qualquer arranjo, e resolve o problema de verdade:
 * antes dele a lista parava no vigésimo item **sem nada indicar que havia mais**.
 *
 * Some quando não há mais o que buscar — um botão que não faz nada é pior que nenhum.
 */
export function CarregarMais({ temMais, carregando, aoTocar }: Readonly<{
  temMais?: boolean;
  carregando?: boolean;
  aoTocar: () => void;
}>) {
  if (!temMais) return null;

  return (
    <Pressable
      style={estilos.botao}
      onPress={aoTocar}
      disabled={carregando}
      accessibilityRole="button"
      accessibilityLabel={carregando ? 'Carregando mais itens' : 'Carregar mais itens'}
      accessibilityState={{ disabled: carregando, busy: carregando }}
    >
      {carregando
        ? <ActivityIndicator color={cores.primaria} />
        : <Text style={estilos.texto}>Carregar mais</Text>}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  botao: {
    minHeight: TOQUE_MINIMO,
    marginTop: espacamento.sm,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: { ...tipografia.corpo, color: cores.primaria, fontWeight: '600' },
});
