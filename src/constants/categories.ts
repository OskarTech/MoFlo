import { MovementType } from '../types';

export interface BaseCategory {
  id: string;
  type: MovementType;
  icon: string;
  isCustom: false;
}

export const BASE_CATEGORIES: BaseCategory[] = [
  // INCOME
  { id: 'salary', type: 'income', icon: 'briefcase', isCustom: false },
  { id: 'freelance', type: 'income', icon: 'laptop', isCustom: false },
  { id: 'investment', type: 'income', icon: 'trending-up', isCustom: false },
  { id: 'gift', type: 'income', icon: 'gift', isCustom: false },
  { id: 'other', type: 'income', icon: 'ellipsis-horizontal', isCustom: false },
  // EXPENSE
  { id: 'housing', type: 'expense', icon: 'home', isCustom: false },
  { id: 'food', type: 'expense', icon: 'restaurant', isCustom: false },
  { id: 'transport', type: 'expense', icon: 'car', isCustom: false },
  { id: 'health', type: 'expense', icon: 'medical', isCustom: false },
  { id: 'entertainment', type: 'expense', icon: 'game-controller', isCustom: false },
  { id: 'shopping', type: 'expense', icon: 'bag', isCustom: false },
  { id: 'education', type: 'expense', icon: 'school', isCustom: false },
  { id: 'bills', type: 'expense', icon: 'receipt', isCustom: false },
  { id: 'other', type: 'expense', icon: 'ellipsis-horizontal', isCustom: false },
];

export const getBaseByType = (type: MovementType): BaseCategory[] =>
  BASE_CATEGORIES.filter((c) => c.type === type);