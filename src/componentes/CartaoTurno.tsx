import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { cores, espacamento, raio, tipografia } from '@/nucleo/tema';
import { formatarData, formatarHora, formatarDiaDaSemana } from '@/contract/format';
import type { Turno } from '@/nucleo/consultas';

/**
 * Um turno na lista.
 *
 * `memo` não é zelo prematuro: esta é a única coisa que se repete centenas de vezes na tela
 * do funcionário, e o orçamento de desempenho do plano é 60fps com 500 itens. Sem ele, cada
 * rolagem recria todos os cartões visíveis.
 *
 * A altura é fixa para a lista virtualizada poder calcular posição sem medir — medir item a
 * item é o que faz rolagem longa engasgar.
 */
export const ALTURA_CARTAO_TURNO = 92;

type Props = {
  turno: Turno;
  destaque?: boolean;
};

function CartaoTurnoBase({ turno, destaque = false }: Readonly<Props>) {
  return (
    <View
      style={[estilos.cartao, destaque && estilos.destaque]}
      accessibilityRole="text"
      accessibilityLabel={
        `Turno em ${turno.location?.name ?? 'local não informado'}, `
        + `${formatarDiaDaSemana(turno.start_timestamp)} ${formatarData(turno.start_timestamp)}, `
        + `das ${formatarHora(turno.start_timestamp)} às ${formatarHora(turno.end_timestamp)}`
      }
    >
      <View style={estilos.coluna}>
        <Text style={estilos.dia}>{formatarDiaDaSemana(turno.start_timestamp)}</Text>
        <Text style={estilos.data}>{formatarData(turno.start_timestamp)}</Text>
      </View>

      <View style={estilos.principal}>
        <Text style={estilos.hora}>
          {formatarHora(turno.start_timestamp)} às {formatarHora(turno.end_timestamp)}
        </Text>
        <Text style={estilos.local} numberOfLines={1}>
          {turno.location?.name ?? '—'}
        </Text>
        {turno.shift_model?.name ? (
          <Text style={estilos.modelo} numberOfLines={1}>{turno.shift_model.name}</Text>
        ) : null}
      </View>
    </View>
  );
}

export const CartaoTurno = memo(CartaoTurnoBase);

const estilos = StyleSheet.create({
  cartao: {
    height: ALTURA_CARTAO_TURNO,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    backgroundColor: cores.fundoCartao,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
    paddingHorizontal: espacamento.md,
  },
  destaque: {
    backgroundColor: cores.turnoPreenchido,
    borderColor: cores.sucesso,
  },
  coluna: { width: 64, alignItems: 'center' },
  dia: { ...tipografia.micro, color: cores.textoSuave, textTransform: 'uppercase' },
  data: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
  principal: { flex: 1, gap: 2 },
  hora: { ...tipografia.subtitulo, color: cores.texto },
  local: { ...tipografia.legenda, color: cores.textoSuave },
  modelo: { ...tipografia.micro, color: cores.textoSuave },
});
