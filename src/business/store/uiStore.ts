import { create } from 'zustand';
import { ConfigListKind } from '../types';

/**
 * Qué ventana de la empresa está abierta. Las ventanas van en el navegador de
 * la empresa (como la de añadir movimiento en el de la app): cualquier
 * pantalla, o el botón +, abre una aquí.
 */
export type BizSheet =
  | { kind: 'order'; orderId?: string }
  | { kind: 'entry'; dayId: string; entryId?: string }
  | { kind: 'close'; dayId: string }
  | { kind: 'expense'; expenseId?: string; date?: string }
  | { kind: 'recurring'; recurringId?: string }
  | { kind: 'product'; productId?: string; categoryId?: string }
  | { kind: 'extra'; extraId?: string }
  | { kind: 'category'; categoryId?: string }
  | { kind: 'item'; list: ConfigListKind; itemId?: string };

interface BizUiStore {
  sheet: BizSheet | null;
  /** La pantalla en la que se está, para el botón + */
  route: string;
  /** La lista que se está editando (Empresa > Empleados…) */
  list: ConfigListKind | null;
  open: (sheet: BizSheet) => void;
  close: () => void;
  setRoute: (route: string) => void;
  setList: (list: ConfigListKind | null) => void;
}

export const useBizUiStore = create<BizUiStore>((set) => ({
  sheet: null,
  route: 'BizToday',
  list: null,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
  setRoute: (route) => set({ route }),
  setList: (list) => set({ list }),
}));
