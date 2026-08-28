import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { useSessao } from '@/nucleo/sessao';
import { AMBIENTE, VERSAO_APP } from '@/nucleo/ambiente';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';

/**
 * Perfil.
 *
 * Só leitura. Editar dados cadastrais é fluxo do site, e trazê-lo para cá exigiria replicar
 * validação de CPF, qualificações e carga horária — sem que ninguém tenha pedido para editar
 * isso no celular.
 *
 * O que a tela precisa mesmo fazer é o resto: sair da conta, e dar caminho para o
 * diagnóstico quando alguém pede ajuda.
 */
const PAPEIS: Record<string, string> = {
  OWNER: 'Responsável pela conta',
  ADMIN: 'Gestor',
  USER: 'Colaborador',
};

export default function Perfil() {
  const { membro, organizacao, usuario, sair } = useSessao();
  const [saindo, setSaindo] = useState(false);

  /**
   * `window.confirm` não existe em React Native — o site usa isso e é uma das divergências
   * registradas. `Alert.alert` é o equivalente nativo, e confirmar importa: sair apaga o
   * cofre, e entrar de novo exige a senha, que nem todo funcionário lembra de cabeça.
   */
  const confirmarSaida = () => {
    Alert.alert(
      'Sair da conta?',
      'Você precisará entrar de novo com e-mail e senha.',
      [
        { text: 'Ficar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: () => {
            setSaindo(true);
            void sair().finally(() => setSaindo(false));
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={estilos.tela}>
      <View style={estilos.cartao}>
        <Text style={estilos.nome}>{membro?.name || 'Sem nome cadastrado'}</Text>
        {usuario?.email ? <Text style={estilos.email}>{usuario.email}</Text> : null}
        <Text style={estilos.papel}>{PAPEIS[String(membro?.role)] || 'Colaborador'}</Text>
      </View>

      {organizacao ? (
        <View style={estilos.cartao}>
          <Text style={estilos.rotulo}>Organização</Text>
          <Text style={estilos.valor}>{organizacao.name}</Text>
        </View>
      ) : null}

      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>Aplicativo</Text>
        <Text style={estilos.valor}>
          Versão {VERSAO_APP}{AMBIENTE === 'production' ? '' : ` · ${AMBIENTE}`}
        </Text>
      </View>

      <Pressable
        style={estilos.link}
        onPress={() => router.push('/diagnostico')}
        accessibilityRole="button"
        accessibilityLabel="Abrir diagnóstico"
      >
        <Text style={estilos.linkTexto}>Diagnóstico</Text>
      </Pressable>

      <Pressable
        style={[estilos.sair, saindo && estilos.desabilitado]}
        onPress={confirmarSaida}
        disabled={saindo}
        accessibilityRole="button"
        accessibilityLabel="Sair da conta"
      >
        {saindo
          ? <ActivityIndicator color={cores.perigo} />
          : <Text style={estilos.sairTexto}>Sair da conta</Text>}
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
    gap: espacamento.xs,
  },
  nome: { ...tipografia.titulo, color: cores.texto },
  email: { ...tipografia.corpo, color: cores.textoSuave },
  papel: { ...tipografia.micro, color: cores.primaria, textTransform: 'uppercase' },

  rotulo: { ...tipografia.micro, color: cores.textoSuave, textTransform: 'uppercase' },
  valor: { ...tipografia.corpo, color: cores.texto },

  link: {
    minHeight: TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: raio.md,
    backgroundColor: cores.secundaria,
  },
  linkTexto: { ...tipografia.corpo, color: cores.primaria, fontWeight: '600' },

  sair: {
    minHeight: TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.perigo,
  },
  desabilitado: { opacity: 0.7 },
  sairTexto: { ...tipografia.corpo, color: cores.perigo, fontWeight: '600' },
});
