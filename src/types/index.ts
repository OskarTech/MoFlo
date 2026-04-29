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
  note?: string;
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
  recurringDay?: number;         // 1-31, día del mes para aportar
  nextContributionDate?: string; // ISO date
  createdAt: string;
  addedBy?: string;
  closedAt?: string;             // ISO date — set when the hucha is closed/completed
}

export type HuchaMovementType = 'deposit' | 'withdrawal';

export interface HuchaMovement {
  id: string;
  huchaId: string;
  huchaName: string;
  huchaColor: string;
  type: HuchaMovementType;
  amount: number;
  date: string;
  createdAt: string;
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

export type JoinRequestStatus = 'pending' | 'rejected';

export interface JoinRequest {
  uid: string;
  displayName: string;
  status: JoinRequestStatus;
  requestedAt: string;
}

export interface PendingJoinRequest {
  accountId: string;
  accountName: string;
  status: JoinRequestStatus;
  requestedAt: string;
}