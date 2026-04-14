// Tipos de movimiento posibles
export type MovementType = 'income' | 'expense' | 'saving';

// Categorías de movimientos
export type MovementCategory =
  // Ingresos
  | 'salary'
  | 'freelance'
  | 'investment'
  | 'gift'
  // Gastos
  | 'housing'
  | 'food'
  | 'transport'
  | 'health'
  | 'entertainment'
  | 'shopping'
  | 'education'
  | 'bills'
  // Ahorros
  | 'emergency'
  | 'retirement'
  | 'travel'
  | 'other';

// Estructura de un movimiento
export interface Movement {
  id: string;
  type: MovementType;
  amount: number;
  category: MovementCategory;
  description: string;
  date: string; // ISO string: "2024-01-15T10:30:00.000Z"
  isRecurring: boolean; // ¿Es un movimiento recurrente?
  recurringDay?: number; // Día del mes que se repite (1-31)
  currency: string; // "EUR", "USD", "PLN"
  createdAt: string;
}

// Estructura de un movimiento recurrente
export interface RecurringMovement {
  id: string;
  type: MovementType;
  amount: number;
  category: MovementCategory;
  description: string;
  recurringDay: number; // Día del mes
  currency: string;
  isActive: boolean;
  createdAt: string;
}

// Resumen mensual calculado
export interface MonthlySummary {
  totalIncome: number;
  totalExpense: number;
  totalSavings: number;
  balance: number;
  month: number; // 1-12
  year: number;
}

// Configuración del usuario
export interface UserSettings {
  currency: string;
  language: string;
  displayName: string;
}

export interface Reminder {
  id: string;
  title: string;
  description: string;
  date: string;
  notificationId: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: MovementType;
  icon: string;
  isCustom: boolean;
  createdAt: string;
}