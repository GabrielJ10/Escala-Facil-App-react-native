import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';

/**
 * A tela neutra de bloqueio.
 *
 * Para onde vai qualquer destino de cobrança — os oito `target_path` do backend que apontam
 * para `/dashboard/settings?tab=billing`, e a categoria BILLING.
 *
 * **O que esta tela não pode ter, e por quê:** preço, nome de plano, botão de assinar, link
 * para o site de pagamento, ou qualquer coisa que leve a comprar fora da App Store. A regra
 * 3.1.3(f) da Apple permite que um app corporativo entregue conteúdo comprado fora — desde
 * que não venda nem direcione para venda dentro do app. Um único botão "renovar assinatura"
 * aqui transforma o app em vitrine e reprova a submissão.
 *
 * Há uma razão de produto além da regra: quem mais vê esta tela é o funcionário, que não é
 * quem paga e não tem como resolver. Oferecer um plano a ele é ruído sem saída.
 *
 * O teste `rotas-do-push.test.ts` cobre o caminho até aqui; o de `apresentacao.test.ts`
 * garante que o texto do 402 também não vende nada.
 */
export default function Indisponivel() {
  return (
    <View style={estilos.tela}>
      <Text style={estilos.titulo}>Indisponível no momento</Text>

      <Text style={estilos.texto}>
        O acesso da sua equipe está suspenso. Fale com o gestor responsável pela conta para
        reativar.
      </Text>

      <Text style={estilos.nota}>
        Seus turnos já carregados continuam visíveis nesta tela do aplicativo.
      </Text>

      <Pressable
        style={estilos.botao}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/minha-escala'))}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
      >
        <Text style={estilos.botaoTexto}>Voltar</Text>
      </Pressable>
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
    backgroundColor: cores.secundaria,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: espacamento.sm,
  },
  botaoTexto: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
});
