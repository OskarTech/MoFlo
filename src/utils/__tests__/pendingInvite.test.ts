import { deliverPendingInvite, receiveInviteCode } from '../pendingInvite';

const APP_ROUTES = ['Home', 'Settings']; // app con sesión: la raíz tiene 'Settings'
const LOGIN_ROUTES = ['Login', 'Register'];

// Navegación falsa cuyo estado se puede cambiar a mitad de test
const makeNav = (initial: { ready: boolean; routeNames: string[] }) => {
  const state = { ...initial };
  const nav = {
    isReady: jest.fn(() => state.ready),
    getRootState: jest.fn(() => ({ routeNames: state.routeNames })),
    navigate: jest.fn(),
  };
  return { nav, state };
};

const expectOpened = (navigate: jest.Mock, code: string) => {
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith('Settings', { screen: 'SharedAccount', params: { code } });
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  // El módulo guarda el código pendiente en memoria: se vacía para el siguiente test
  deliverPendingInvite(makeNav({ ready: true, routeNames: APP_ROUTES }).nav);
  jest.useRealTimers();
});

describe('pendingInvite', () => {
  it('con la app lista abre la cuenta compartida con el código', () => {
    const { nav } = makeNav({ ready: true, routeNames: APP_ROUTES });

    receiveInviteCode('ABC123', nav);

    expectOpened(nav.navigate, 'ABC123');
  });

  it('sin sesión guarda el código y lo abre al entrar en la app', () => {
    const { nav, state } = makeNav({ ready: true, routeNames: LOGIN_ROUTES });

    receiveInviteCode('ABC123', nav);
    jest.advanceTimersByTime(10_000);
    expect(nav.navigate).not.toHaveBeenCalled();

    // Inicia sesión: AppNavigator se monta y entrega lo pendiente
    state.routeNames = APP_ROUTES;
    deliverPendingInvite(nav);

    expectOpened(nav.navigate, 'ABC123');
  });

  it('si la app acaba de arrancar mientras reintenta, lo abre una sola vez', () => {
    const { nav, state } = makeNav({ ready: false, routeNames: [] });

    receiveInviteCode('ABC123', nav);
    jest.advanceTimersByTime(300);
    state.ready = true;
    state.routeNames = APP_ROUTES;
    jest.advanceTimersByTime(10_000);
    deliverPendingInvite(nav); // AppNavigator al montarse: ya no queda nada

    expectOpened(nav.navigate, 'ABC123');
  });

  it('deja de reintentar a los 5 segundos sin perder el código', () => {
    const { nav, state } = makeNav({ ready: false, routeNames: [] });

    receiveInviteCode('ABC123', nav);
    jest.advanceTimersByTime(5_000);
    expect(jest.getTimerCount()).toBe(0);
    expect(nav.navigate).not.toHaveBeenCalled();

    state.ready = true;
    state.routeNames = APP_ROUTES;
    deliverPendingInvite(nav);

    expectOpened(nav.navigate, 'ABC123');
  });

  it('un enlace nuevo sustituye al que estaba pendiente', () => {
    const { nav, state } = makeNav({ ready: true, routeNames: LOGIN_ROUTES });

    receiveInviteCode('AAA111', nav);
    receiveInviteCode('BBB222', nav);
    state.routeNames = APP_ROUTES;
    deliverPendingInvite(nav);

    expectOpened(nav.navigate, 'BBB222');
  });

  it('sin código pendiente no navega', () => {
    const { nav } = makeNav({ ready: true, routeNames: APP_ROUTES });

    deliverPendingInvite(nav);

    expect(nav.navigate).not.toHaveBeenCalled();
  });
});
