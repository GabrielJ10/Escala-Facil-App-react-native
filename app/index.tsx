import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { useSessao } from '@/nucleo/sessao';
import { cores } from '@/nucleo/tema';

/** Porta de entrada: espera a restauração da sessão e encaminha. */
export default function Inicio() {
  const { carregando, autenticado } = useSessao();

  useEffect(() => {
    if (carregando) return;
    router.replace(autenticado ? '/minha-escala' : '/entrar');
  }, [carregando, autenticado]);

  return (
    <View style={estilos.centro}>
      <ActivityIndicator size="large" color={cores.primaria} />
    </View>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundo },
});
