import { useState } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';

import { useSessao } from '@/nucleo/sessao';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';
import type { ErroApi } from '@/nucleo/api';

export default function Entrar() {
  const { entrar } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEntrar() {
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email.trim(), senha);
      router.replace('/minha-escala');
    } catch (e) {
      setErro((e as ErroApi)?.message || 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  const podeEnviar = email.trim().length > 3 && senha.length > 0 && !enviando;

  return (
    <KeyboardAvoidingView
      style={estilos.tela}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={estilos.conteudo}>
        <Text style={estilos.titulo}>Escala Fácil</Text>
        <Text style={estilos.legenda}>Entre para ver sua escala.</Text>

        <TextInput
          style={estilos.campo}
          placeholder="E-mail"
          placeholderTextColor={cores.textoSuave}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          accessibilityLabel="E-mail"
        />

        <TextInput
          style={estilos.campo}
          placeholder="Senha"
          placeholderTextColor={cores.textoSuave}
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          autoComplete="current-password"
          accessibilityLabel="Senha"
        />

        {erro && <Text style={estilos.erro}>{erro}</Text>}

        <Pressable
          style={[estilos.botao, !podeEnviar && estilos.botaoInativo]}
          onPress={aoEntrar}
          disabled={!podeEnviar}
          accessibilityRole="button"
          accessibilityLabel="Entrar"
        >
          {enviando
            ? <ActivityIndicator color={cores.primariaTexto} />
            : <Text style={estilos.botaoTexto}>Entrar</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo, justifyContent: 'center' },
  conteudo: { padding: espacamento.lg, gap: espacamento.md },
  titulo: { ...tipografia.titulo, color: cores.texto },
  legenda: { ...tipografia.corpo, color: cores.textoSuave, marginBottom: espacamento.sm },
  campo: {
    minHeight: TOQUE_MINIMO,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    paddingHorizontal: espacamento.md,
    backgroundColor: cores.fundoCartao,
    color: cores.texto,
    ...tipografia.corpo,
  },
  erro: { ...tipografia.legenda, color: cores.perigo },
  botao: {
    minHeight: TOQUE_MINIMO,
    borderRadius: raio.md,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoInativo: { opacity: 0.5 },
  botaoTexto: { ...tipografia.corpo, color: cores.primariaTexto, fontWeight: '600' },
});
