import React from 'react';
import type { MemberLabel } from '../../utils/memberLabel';
import StrikeText from './StrikeText';

/** Nombre de un miembro dentro de otro texto: tachado si ya no está en la cuenta */
const MemberName = ({ member }: { member: MemberLabel }) => (
  <StrikeText struck={member.isFormer}>{member.name}</StrikeText>
);

export default MemberName;
