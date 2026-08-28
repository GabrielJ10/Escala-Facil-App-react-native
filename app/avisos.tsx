import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import {
  pedirPermissao,
  registrarAparelho,
  situacaoDaPermissao,
  type SituacaoDaPermissao,
} from '@/nucleo/push';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';

/**
 * A tela que pede permissão de notificação — e a razão de ela existir.
 *
 * **No iOS o pedido do sistema acontece uma vez só.** Negada, o sistema não pergunta de
 * novo; recuperar exige mandar a pessoa às Configurações, um caminho que quase ninguém
 * percorre. Então disparar `requestPermissionsAsync` na primeira abertura queima a única
 * chance no pior momento possível: antes de a pessoa ter visto o produto e entendido para
 * que serve o aviso.
 *
 * Esta tela vem antes. Explica o que chega — e só o que realmente chega, três coisas
 * concretas — e o pedido do sistema só sai depois do toque em "Ativar". Quem toca em "Agora
 * não" não gasta a chance: pode voltar aqui pelo perfil.
 *
 * Não é chamada na abertura. É oferecida depois que a pessoa já viu a própria escala.
 */
export default function Avisos() {
  const [situacao, setSituacao] = useState<SituacaoDaPermissao | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    void situacaoDaPermissao().then((s) => { if (!cancelado) setSituacao(s); });
    return () => { cancelado = true; };
  }, []);

  const ativar = async () => {
    setTrabalhando(true);
    try {
      const resultado = await pedirPermissao();
      setSituacao(resultado);
      if (resultado === 'concedida') {
        await registrarAparelho();
        router.back();
      }
    } finally {
      setTrabalhando(false);
    }
  };

  if (situacao === null) {
    return (
      <View style={estilos.tela}>
        <ActivityIndicator size="large" color={cores.primaria} />
      </View>
    );
  }

  return (
    <View style={estilos.tela}>
      <Text style={estilos.titulo}>Avisos no celular</Text>

      <View style={estilos.itens}>
        <Item texto="Quando um turno seu mudar de horário ou de local." />
        <Item texto="Quando alguém pedir uma troca com você." />
        <Item texto="Quando seu pedido de afastamento for respondido." />
      </View>

      <Text style={estilos.nota}>
        Só isso. Nada de propaganda.
      </Text>

      {situacao === 'negada' ? (
        <>
          <Text style={estilos.negada}>
            Os avisos estão desligados nas configurações do sistema. Para ligar, é preciso
            fazer isso por lá.
          </Text>
          <Pressable
            style={estilos.principal}
            onPress={() => void Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Abrir as configurações do sistema"
          >
            <Text style={estilos.principalTexto}>Abrir configurações</Text>
          </Pressable>
        </>
      ) : null}

      {situacao === 'nao-perguntada' ? (
        <Pressable
          style={[estilos.principal, trabalhando && estilos.desabilitado]}
          onPress={() => void ativar()}
          disabled={trabalhando}
          accessibilityRole="button"
          accessibilityLabel="Ativar os avisos"
        >
          {trabalhando
            ? <ActivityIndicator color={cores.primariaTexto} />
            : <Text style={estilos.principalTexto}>Ativar avisos</Text>}
        </Pressable>
      ) : null}

      {situacao === 'concedida' ? (
        <Text style={estilos.concedida}>Os avisos já estão ligados neste aparelho.</Text>
      ) : null}

      <Pressable
        style={estilos.secundario}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/minha-escala'))}
        accessibilityRole="button"
        accessibilityLabel="Voltar sem ativar"
      >
        <Text style={estilos.secundarioTexto}>
          {situacao === 'concedida' ? 'Voltar' : 'Agora não'}
        </Text>
      </Pressable>
    </View>
  );
}

function Item({ texto }: Readonly<{ texto: string }>) {
  return (
    <View style={estilos.item}>
      <View style={estilos.marcador} />
      <Text style={estilos.itemTexto}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: {
    flex: 1,
    justifyContent: 'center',
    padding: espacamento.lg,
    gap: espacamento.md,
    backgroundColor: cores.fundo,
  },
  titulo: { ...tipografia.titulo, color: cores.texto },

  itens: { gap: espacamento.sm },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: espacamento.sm },
  marcador: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: cores.primaria,
    marginTop: 7,
  },
  itemTexto: { ...tipografia.corpo, color: cores.texto, flex: 1 },

  nota: { ...tipografia.legenda, color: cores.textoSuave },
  negada: { ...tipografia.legenda, color: cores.aviso },
  concedida: { ...tipografia.corpo, color: cores.sucesso },

  principal: {
    minHeight: TOQUE_MINIMO,
    borderRadius: raio.md,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desabilitado: { opacity: 0.7 },
  principalTexto: { ...tipografia.corpo, color: cores.primariaTexto, fontWeight: '600' },

  secundario: {
    minHeight: TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secundarioTexto: { ...tipografia.corpo, color: cores.textoSuave },
});
