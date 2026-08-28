import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { AMBIENTE, API_URL, VERSAO_APP } from '@/nucleo/ambiente';
import { lerAccessToken } from '@/nucleo/api';
import { useSessao } from '@/nucleo/sessao';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';

/**
 * Diagnóstico — o que transforma "está estranho aqui" em informação.
 *
 * Alcançada por sete toques na versão, não pelo menu: é ferramenta de suporte, não de
 * produto. O botão de copiar existe porque ninguém vai transcrever isso à mão numa conversa
 * de suporte, e print de tela perde o que importa.
 *
 * NUNCA mostra o token inteiro — só o suficiente para saber se existe e se é o mesmo que o
 * servidor viu.
 */
function resumirToken(token: string | null): string {
  if (!token) return 'ausente';
  return `${token.slice(0, 8)}…${token.slice(-4)} (${token.length} caracteres)`;
}

export default function Diagnostico() {
  const { membro, organizacao, autenticado } = useSessao();
  const [copiado, setCopiado] = useState(false);

  const linhas: Array<[string, string]> = [
    ['Ambiente', AMBIENTE],
    ['Versão do app', VERSAO_APP],
    ['Servidor', API_URL],
    ['Sessão', autenticado ? 'ativa' : 'ausente'],
    ['Access token', resumirToken(lerAccessToken())],
    ['Papel', membro?.role ?? '—'],
    ['Organização', organizacao?.name ?? '—'],
    ['Cobrança', organizacao?.billing_status ?? '—'],
  ];

  async function copiar() {
    await Clipboard.setStringAsync(linhas.map(([k, v]) => `${k}: ${v}`).join('\n'));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <ScrollView contentContainerStyle={estilos.tela}>
      {linhas.map(([rotulo, valor]) => (
        <View key={rotulo} style={estilos.linha}>
          <Text style={estilos.rotulo}>{rotulo}</Text>
          <Text style={estilos.valor} selectable>{valor}</Text>
        </View>
      ))}

      <Pressable
        style={estilos.botao}
        onPress={copiar}
        accessibilityRole="button"
        accessibilityLabel="Copiar diagnóstico"
      >
        <Text style={estilos.botaoTexto}>{copiado ? 'Copiado' : 'Copiar diagnóstico'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: espacamento.lg, gap: espacamento.sm },
  linha: {
    backgroundColor: cores.fundoCartao,
    borderRadius: raio.md,
    padding: espacamento.md,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  rotulo: { ...tipografia.micro, color: cores.textoSuave, textTransform: 'uppercase' },
  valor: { ...tipografia.corpo, color: cores.texto, marginTop: 2 },
  botao: {
    minHeight: TOQUE_MINIMO,
    marginTop: espacamento.md,
    borderRadius: raio.md,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoTexto: { ...tipografia.corpo, color: cores.primariaTexto, fontWeight: '600' },
});
