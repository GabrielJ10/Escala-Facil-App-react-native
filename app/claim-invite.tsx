import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { apiFetch } from '@/nucleo/api';
import { useSessao } from '@/nucleo/sessao';
import { mensagemDeErro } from '@/nucleo/apresentacao';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';

/**
 * O convite do gestor, aberto no aplicativo.
 *
 * É por aqui que o funcionário entra na organização: o gestor manda um link
 * `https://escalafacil.app.br/claim-invite?token=...`, e os universal links / app links do
 * `app.config.ts` fazem ele abrir aqui em vez do navegador.
 *
 * **O nome do arquivo tem que ser exatamente `claim-invite`.** Ele espelha a rota do site, e
 * é o caminho que o expo-router casa com o link. Renomear para algo em português quebraria
 * todos os convites já enviados — o link vive no e-mail de alguém, não no nosso código.
 *
 * A ordem importa: `POST /users/claim-invite` fica atrás de `requireAuth` (e antes do
 * `TenantMiddleware`, porque a pessoa ainda não tem organização). Então quem chega sem
 * sessão precisa entrar primeiro; o token fica guardado e o resgate acontece na volta.
 */
export default function ClaimInvite() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { carregando, autenticado, recarregarPerfil } = useSessao();

  const [estado, setEstado] = useState<'esperando' | 'resgatando' | 'pronto' | 'falhou'>('esperando');
  const [erro, setErro] = useState<unknown>(null);

  // O resgate é uma escrita: repetir cria evento duplicado no servidor. A trava garante uma
  // tentativa por montagem, mesmo que os efeitos reavaliem.
  const jaTentou = useRef(false);

  const resgatar = useCallback(async () => {
    if (jaTentou.current || !token) return;
    jaTentou.current = true;

    setEstado('resgatando');
    try {
      await apiFetch('/users/claim-invite', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });

      // O perfil muda por completo: quem não tinha organização passa a ter, com papel e
      // capacidades novos. Sem recarregar, o app continuaria achando que a pessoa está fora.
      await recarregarPerfil();
      setEstado('pronto');
    } catch (falha) {
      setErro(falha);
      setEstado('falhou');
    }
  }, [token, recarregarPerfil]);

  useEffect(() => {
    if (carregando || !autenticado || !token) return;
    // `resgatar` marca 'resgatando' antes do primeiro `await`, e é só isso que o linter vê.
    // Não é estado derivado de outro estado: é uma escrita no servidor — o caso que a própria
    // mensagem da regra descreve como aquilo para que efeitos existem. A trava `jaTentou`
    // garante uma tentativa por montagem, então não há cascata.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void resgatar();
  }, [carregando, autenticado, token, resgatar]);

  if (!token) {
    return (
      <Aviso
        titulo="Convite incompleto"
        detalhe="Este link não traz o código do convite. Peça um novo ao seu gestor."
      />
    );
  }

  if (carregando) return <Girando />;

  if (!autenticado) {
    return (
      <View style={estilos.tela}>
        <Text style={estilos.titulo}>Convite recebido</Text>
        <Text style={estilos.texto}>
          Entre com sua conta para fazer parte da equipe. Se ainda não tem conta, crie uma com
          o mesmo e-mail em que recebeu o convite.
        </Text>

        <Pressable
          style={estilos.botao}
          onPress={() => router.push({ pathname: '/entrar', params: { convite: token } })}
          accessibilityRole="button"
          accessibilityLabel="Entrar para aceitar o convite"
        >
          <Text style={estilos.botaoTexto}>Entrar</Text>
        </Pressable>
      </View>
    );
  }

  if (estado === 'resgatando' || estado === 'esperando') return <Girando />;

  if (estado === 'falhou') {
    const { titulo, detalhe } = mensagemDeErro(erro);
    return (
      <View style={estilos.tela}>
        <Text style={estilos.titulo}>{titulo}</Text>
        <Text style={estilos.texto}>{detalhe}</Text>
        <Text style={estilos.nota}>
          Convites vencem. Se o seu já passou do prazo, peça outro ao gestor.
        </Text>

        <Pressable
          style={estilos.botao}
          onPress={() => router.replace('/minha-escala')}
          accessibilityRole="button"
          accessibilityLabel="Ir para minha escala"
        >
          <Text style={estilos.botaoTexto}>Continuar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={estilos.tela}>
      <Text style={estilos.titulo}>Tudo certo</Text>
      <Text style={estilos.texto}>Você agora faz parte da equipe.</Text>

      <Pressable
        style={estilos.botao}
        onPress={() => router.replace('/minha-escala')}
        accessibilityRole="button"
        accessibilityLabel="Ver minha escala"
      >
        <Text style={estilos.botaoTexto}>Ver minha escala</Text>
      </Pressable>
    </View>
  );
}

function Girando() {
  return (
    <View style={estilos.tela} accessibilityLabel="Carregando">
      <ActivityIndicator size="large" color={cores.primaria} />
    </View>
  );
}

function Aviso({ titulo, detalhe }: Readonly<{ titulo: string; detalhe: string }>) {
  return (
    <View style={estilos.tela}>
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={estilos.texto}>{detalhe}</Text>
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
