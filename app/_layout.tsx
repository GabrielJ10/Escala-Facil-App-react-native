// O polyfill de Intl precisa carregar antes de qualquer coisa que formate texto.
import '@/nucleo/intl';

import { useEffect, useState } from 'react';
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

/**
 * Cache que sobrevive ao fechamento do app.
 *
 * É o que cumpre a promessa de leitura offline: quem já abriu a escala continua vendo, sem
 * sinal, na próxima abertura. `gcTime` de 7 dias porque um turno de semana que vem continua
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

export default function LayoutRaiz() {
  const [pronto, setPronto] = useState(false);

  useEffect(() => { setPronto(true); }, []);
  if (!pronto) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={cliente}
          persistOptions={{ persister: persistidor, maxAge: 7 * 24 * 60 * 60 * 1000 }}
        >
          <SessaoProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: cores.fundoCartao },
                headerTintColor: cores.texto,
                contentStyle: { backgroundColor: cores.fundo },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="entrar" options={{ title: 'Entrar' }} />
              <Stack.Screen name="minha-escala" options={{ title: 'Minha escala', headerBackVisible: false }} />
              <Stack.Screen name="diagnostico" options={{ title: 'Diagnóstico' }} />
            </Stack>
          </SessaoProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
