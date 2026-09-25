import React from 'react';
import { StyleSheet, Text } from 'react-native';

/**
 * Parte de un texto que se tacha cuando ya no existe: un miembro que dejó la
 * cuenta, una categoría borrada. Es el Text de React Native y no el de Paper
 * para que herede la letra y el color del texto que lo rodea: el de Paper
 * pondría los suyos.
 */
const StrikeText = ({ struck, children }: { struck: boolean; children: React.ReactNode }) => (
  <Text style={struck ? styles.struck : undefined}>{children}</Text>
);

const styles = StyleSheet.create({
  struck: { textDecorationLine: 'line-through' },
});

export default StrikeText;
