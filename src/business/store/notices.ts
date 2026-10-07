import { Alert } from 'react-native';
import i18n from '../../i18n';

// Un solo aviso aunque la nube rechace varios a la vez
let lastAt = 0;

/**
 * La nube ha rechazado algo apuntado en este móvil: un pedido que llegó con
 * el día ya cerrado (se apuntó sin conexión mientras otro socio cerraba). Ya
 * se ha quitado de la copia: se avisa para que se pueda volver a apuntar.
 */
export const notifyRejected = (_what: 'order') => {
  if (Date.now() - lastAt < 4000) return;
  lastAt = Date.now();
  Alert.alert(i18n.t('business.rejected.title'), i18n.t('business.rejected.order'));
};
