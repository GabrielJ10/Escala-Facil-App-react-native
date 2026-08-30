// O polyfill de Intl precisa carregar antes de qualquer coisa que formate texto.
import '@/nucleo/intl';

import * as Sentry from '@sentry/react-native';

import { iniciarObservabilidade } from '@/nucleo/observabilidade';

// Antes de qualquer tela montar: um erro na primeira renderização é o que mais interessa
// capturar, e ele acontece antes de qualquer efeito rodar. Sem DSN, isto não faz nada.
iniciarObservabilidade();

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { cores } from '@/nucleo/tema';
import { SessaoProvider } from '@/nucleo/sessao';
import { PortaoDeVersao } from '@/componentes/PortaoDeVersao';
import { ComunicadoDoFundador } from '@/componentes/ComunicadoDoFundador';
import { useNavegacaoPorPush } from '@/nucleo/ganchos-de-push';
import { configurarApresentacao } from '@/nucleo/push';
import { observarRede } from '@/nucleo/rede-do-sistema';

/**
 * Cache que sobrevive ao fechamento do app.
 *
 * É o que cumpre a promessa de leitura offline: quem já abriu a escala continua vendo, sem
 * sinal, na próxima abertura. `gcTime` de 7 dias porque um turno da semana que vem continua
 * valendo; `staleTime` curto porque a escala muda e queremos revalidar assim que houver rede.
 */
const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Mutação nunca é repetida sozinha: no app, repetir uma alocação pode duplicar turno.
      retry: 0,
    },
  },
});

const persistidor = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'escala-facil-cache',
});

// Fora do componente: define como a notificação se comporta com o app aberto, e precisa
// valer antes da primeira renderização.
configurarApresentacao();

/**
 * O estado da rede alimenta o TanStack Query desde o arranque.
 *
 * Fora do componente, e sem desinscrição, de propósito: a assinatura precisa durar o
 * aplicativo inteiro. Amarrá-la a um efeito faria a informação sumir num remount do layout
 * raiz, e o app voltaria a se achar online estando sem sinal — que é o defeito que este
 * módulo existe para corrigir.
 */
observarRede();

function LayoutRaiz() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={cliente}
          persistOptions={{ persister: persistidor, maxAge: 7 * 24 * 60 * 60 * 1000 }}
        >
          <PortaoDeVersao>
            <SessaoProvider>
              <StatusBar style="dark" />
              <Navegacao />
              {/* Fora da pilha: um comunicado não é uma tela, e empilhá-lo faria o botão
                  voltar do Android levar de volta a ele. */}
              <ComunicadoDoFundador />
            </SessaoProvider>
          </PortaoDeVersao>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Precisa ser um componente separado: `useNavegacaoPorPush` chama `useSessao`, e um hook não
 * enxerga um provedor declarado no mesmo componente que o renderiza.
 */
function Navegacao() {
  useNavegacaoPorPush();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: cores.fundoCartao },
        headerTintColor: cores.texto,
        contentStyle: { backgroundColor: cores.fundo },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="entrar" options={{ title: 'Entrar' }} />
      <Stack.Screen name="claim-invite" options={{ title: 'Convite' }} />
      <Stack.Screen
        name="minha-escala"
        options={{ title: 'Minha escala', headerBackVisible: false }}
      />
      <Stack.Screen name="trocas" options={{ title: 'Trocas' }} />
      <Stack.Screen name="afastamentos" options={{ title: 'Afastamentos' }} />
      <Stack.Screen name="notificacoes" options={{ title: 'Avisos' }} />
      <Stack.Screen name="solicitacoes" options={{ title: 'Solicitações' }} />
      <Stack.Screen name="escala" options={{ title: 'Escala da equipe' }} />
      <Stack.Screen name="turno-avulso" options={{ title: 'Novo turno' }} />
      <Stack.Screen name="turno/[id]" options={{ title: 'Turno' }} />
      <Stack.Screen name="perfil" options={{ title: 'Perfil' }} />
      <Stack.Screen name="avisos" options={{ title: 'Avisos no celular' }} />
      <Stack.Screen name="calendario" options={{ title: 'Agenda do celular' }} />
      <Stack.Screen name="indisponivel" options={{ title: 'Acesso suspenso' }} />
      <Stack.Screen name="diagnostico" options={{ title: 'Diagnóstico' }} />
    </Stack>
  );
}

/**
 * `Sentry.wrap` é o que liga a instrumentação automática do Expo Router: tempo até a primeira
 * tela, navegação entre rotas e a fronteira que captura um erro de renderização antes de ele
 * virar tela branca.
 *
 * Envolve mesmo sem DSN — aí o SDK não está inicializado e o invólucro só repassa. Manter
 * incondicional evita a diferença clássica entre o que roda em desenvolvimento e o que roda
 * na loja.
 */
export default Sentry.wrap(LayoutRaiz);
