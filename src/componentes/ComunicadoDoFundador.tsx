import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import {
  useCampanhasAtivas,
  useDispensarCampanha,
  useRegistrarEventoDeCampanha,
} from '@/nucleo/consultas';
import { acaoAoFechar, montarFila, type ComunicadoNoApp } from '@/nucleo/campanhas';
import { ehDestinoDeCobranca } from '@/nucleo/rotas-do-push';
import { useSessao } from '@/nucleo/sessao';
import { cores, espacamento, raio, tipografia, TOQUE_MINIMO } from '@/nucleo/tema';

/**
 * Os comunicados do fundador, um de cada vez.
 *
 * DIVERGE do site — ver docs/divergencias-app-web.md. As regras da fila são as mesmas e
 * estão em `src/nucleo/campanhas.ts`, puras e testadas; o que muda é a apresentação e uma
 * decisão de segurança: **o app não renderiza o HTML da campanha.**
 *
 * O site o exibe num iframe com sandbox, segunda camada sobre a sanitização do servidor.
 * React Native não tem iframe — mostrar aquele HTML exigiria uma WebView, sem sandbox
 * equivalente, dentro de um modal, num app instalado. Comunicado com formatação vira
 * comunicado simples; é a troca consciente.
 *
 * Fica fora da pilha de navegação de propósito: um comunicado não é uma tela, e empilhá-lo
 * faria o botão "voltar" do Android levar de volta a ele.
 */
export function ComunicadoDoFundador() {
  const { autenticado } = useSessao();

  const campanhas = useCampanhasAtivas(autenticado);
  const dispensar = useDispensarCampanha();
  const registrarEvento = useRegistrarEventoDeCampanha();

  /**
   * Escondidas nesta execução do app — memória, não disco.
   *
   * Diferente de dispensar: dispensar vai ao servidor e vale para sempre. Esconder existe
   * para o comunicado não voltar no instante seguinte, quando a lista é recarregada.
   */
  const [escondidas, setEscondidas] = useState<ReadonlySet<string>>(() => new Set());

  // Uma impressão por comunicado, por execução. O servidor também deduplica, mas mandar
  // duas vezes já poluiria o relatório do fundador antes de ele chegar lá.
  const jaContadas = useRef<Set<string>>(new Set());

  const fila = useMemo(
    () => montarFila(campanhas.data ?? [], escondidas),
    [campanhas.data, escondidas],
  );

  const atual: ComunicadoNoApp | null = fila[0] ?? null;

  const esconder = useCallback((id: string) => {
    setEscondidas((antes) => new Set(antes).add(id));
  }, []);

  useEffect(() => {
    if (!atual || jaContadas.current.has(atual.id)) return;
    jaContadas.current.add(atual.id);
    registrarEvento.mutate({ id: atual.id, tipo: 'IMPRESSION' });
  }, [atual, registrarEvento]);

  /**
   * Dispensa no servidor, mas nunca deixa o modal preso.
   *
   * Se a rede falhar, esconder na sessão é a saída: o comunicado volta na próxima abertura,
   * o que é bem melhor que um modal que não fecha.
   */
  const dispensarNoServidor = useCallback((comunicado: ComunicadoNoApp) => {
    dispensar.mutate(
      { id: comunicado.id, chave: comunicado.chave },
      { onSettled: () => esconder(comunicado.id) },
    );
  }, [dispensar, esconder]);

  const aoFechar = useCallback(() => {
    if (!atual) return;

    if (acaoAoFechar(atual.modo) === 'dispensar-no-servidor') dispensarNoServidor(atual);
    else esconder(atual.id);
  }, [atual, dispensarNoServidor, esconder]);

  const aoTocarNoBotao = useCallback(() => {
    if (!atual) return;

    registrarEvento.mutate({ id: atual.id, tipo: 'CLICK' });

    // Tocar no botão é sempre "já vi", nos dois modos: a pessoa agiu sobre o comunicado.
    dispensarNoServidor(atual);

    // Cobrança nunca abre tela de cobrança a partir de um comunicado — a mesma regra do
    // push, e pelo mesmo motivo (3.1.3(f)). O botão fecha e pronto.
    if (atual.destino && !ehDestinoDeCobranca(atual.destino)) router.push(atual.destino);
  }, [atual, dispensarNoServidor, registrarEvento]);

  if (!autenticado || !atual) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={aoFechar}
      statusBarTranslucent
    >
      <View style={estilos.fundo}>
        <View style={estilos.caixa}>
          <ScrollView contentContainerStyle={estilos.conteudo}>
            {atual.imagem ? (
              <Image
                source={{ uri: atual.imagem }}
                style={estilos.imagem}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                // Sem `accessibilityLabel`: a imagem é decorativa, e o texto do comunicado
                // é que carrega a informação. Rotular a URL seria ruído no leitor de tela.
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            ) : null}

            <Text style={estilos.titulo}>{atual.titulo}</Text>
            <Text style={estilos.corpo}>{atual.corpo}</Text>
          </ScrollView>

          <View style={estilos.acoes}>
            <Pressable
              style={estilos.secundario}
              onPress={aoFechar}
              disabled={dispensar.isPending}
              accessibilityRole="button"
              accessibilityLabel="Fechar comunicado"
            >
              <Text style={estilos.secundarioTexto}>Fechar</Text>
            </Pressable>

            <Pressable
              style={[estilos.principal, dispensar.isPending && estilos.desabilitado]}
              onPress={aoTocarNoBotao}
              disabled={dispensar.isPending}
              accessibilityRole="button"
              accessibilityLabel={atual.rotuloDoBotao}
            >
              {dispensar.isPending
                ? <ActivityIndicator color={cores.primariaTexto} />
                : <Text style={estilos.principalTexto}>{atual.rotuloDoBotao}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: espacamento.lg,
  },
  caixa: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: cores.fundoCartao,
    borderRadius: raio.lg,
    overflow: 'hidden',
  },
  conteudo: { padding: espacamento.lg, gap: espacamento.sm },
  imagem: {
    width: '100%',
    height: 160,
    borderRadius: raio.md,
    backgroundColor: cores.secundaria,
  },
  titulo: { ...tipografia.titulo, color: cores.texto },
  corpo: { ...tipografia.corpo, color: cores.textoSuave },

  acoes: {
    flexDirection: 'row',
    gap: espacamento.sm,
    padding: espacamento.md,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  secundario: {
    flex: 1,
    minHeight: TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: raio.md,
    backgroundColor: cores.secundaria,
  },
  secundarioTexto: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
  principal: {
    flex: 1,
    minHeight: TOQUE_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: raio.md,
    backgroundColor: cores.primaria,
  },
  desabilitado: { opacity: 0.7 },
  principalTexto: { ...tipografia.corpo, color: cores.primariaTexto, fontWeight: '600' },
});
