import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';
import { mensagemDeErro } from '@/nucleo/apresentacao';

/**
 * Os estados que toda tela que busca dado tem.
 *
 * Sem um lugar comum, cada tela inventa o seu — e as diferenças aparecem justamente nos
 * momentos ruins: uma diz "erro", outra mostra tela branca, uma terceira deixa o giro
 * rodando para sempre. O usuário aprende que o app é instável mesmo quando só falta sinal.
 *
 * O texto do erro vem de `mensagemDeErro`, que é pura e tem teste. Aqui só há arranjo.
 */

export function Carregando() {
  return (
    <View style={estilos.centro} accessibilityLabel="Carregando">
      <ActivityIndicator size="large" color={cores.primaria} />
    </View>
  );
}

export function Vazio({ titulo, detalhe }: Readonly<{ titulo: string; detalhe?: string }>) {
  return (
    <View style={estilos.centro}>
      <Text style={estilos.titulo}>{titulo}</Text>
      {detalhe ? <Text style={estilos.detalhe}>{detalhe}</Text> : null}
    </View>
  );
}

export function Erro({ erro, aoTentarDeNovo }: Readonly<{ erro: unknown; aoTentarDeNovo?: () => void }>) {
  const { titulo, detalhe, podeTentarDeNovo } = mensagemDeErro(erro);

  return (
    <View style={estilos.centro}>
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={estilos.detalhe}>{detalhe}</Text>

      {podeTentarDeNovo && aoTentarDeNovo ? (
        <Pressable
          style={estilos.botao}
          onPress={aoTentarDeNovo}
          accessibilityRole="button"
          accessibilityLabel="Tentar novamente"
        >
          <Text style={estilos.botaoTexto}>Tentar novamente</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Erro de uma ação, em faixa — não substitui a tela.
 *
 * Quando a lista já está na frente da pessoa, trocá-la por uma tela de erro porque um toque
 * falhou é perder o que já funcionava. A faixa avisa e o conteúdo permanece.
 */
export function FaixaDeErro({ erro }: Readonly<{ erro: unknown }>) {
  const { titulo, detalhe } = mensagemDeErro(erro);

  return (
    <View style={estilos.faixa} accessibilityRole="alert">
      <Text style={estilos.faixaTitulo}>{titulo}</Text>
      <Text style={estilos.faixaTexto}>{detalhe}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espacamento.lg,
    gap: espacamento.sm,
  },
  titulo: { ...tipografia.subtitulo, color: cores.texto, textAlign: 'center' },
  detalhe: { ...tipografia.corpo, color: cores.textoSuave, textAlign: 'center' },
  botao: {
    minHeight: TOQUE_MINIMO,
    marginTop: espacamento.sm,
    paddingHorizontal: espacamento.lg,
    borderRadius: raio.md,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoTexto: { ...tipografia.corpo, color: cores.primariaTexto, fontWeight: '600' },

  faixa: {
    backgroundColor: '#FEF2F2',
    borderRadius: raio.md,
    padding: espacamento.md,
    borderWidth: 1,
    borderColor: cores.perigo,
    gap: 2,
  },
  faixaTitulo: { ...tipografia.legenda, color: cores.perigo, fontWeight: '600' },
  faixaTexto: { ...tipografia.legenda, color: cores.texto },
});
