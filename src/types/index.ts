// Tipos de movimiento posibles
export type MovementType = 'income' | 'expense';

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
  addedBy?: string;
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

// Meta de ahorro (hucha)
export interface Hucha {
  id: string;
  name: string;
  icon: string;
  color: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;        // 'YYYY-MM'
  isAutomatic: boolean;
  monthlyAmount?: number;
  nextContributionDate?: string; // ISO date
  createdAt: string;
  addedBy?: string;
}

// Resumen mensual calculado
export interface MonthlySummary {
  totalIncome: number;
  totalExpense: number;
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

export interface SharedAccount {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
  memberNames: { [uid: string]: string };
  inviteCode: string;
  createdAt: string;
  currencyCode?: string;
}