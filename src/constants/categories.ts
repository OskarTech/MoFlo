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
  { id: 'sales', type: 'income', icon: 'pricetag', isCustom: false },
  { id: 'gift', type: 'income', icon: 'gift', isCustom: false },
  { id: 'bonus', type: 'income', icon: 'star', isCustom: false },
  { id: 'other', type: 'income', icon: 'ellipsis-horizontal', isCustom: false },
  // EXPENSE
  { id: 'housing', type: 'expense', icon: 'home', isCustom: false },
  { id: 'food', type: 'expense', icon: 'cart', isCustom: false },
  { id: 'transport', type: 'expense', icon: 'car', isCustom: false },
  { id: 'entertainment', type: 'expense', icon: 'game-controller', isCustom: false },
  { id: 'subscriptions', type: 'expense', icon: 'repeat', isCustom: false },
  { id: 'unexpected', type: 'expense', icon: 'alert-circle', isCustom: false },
  { id: 'other', type: 'expense', icon: 'ellipsis-horizontal', isCustom: false },
];

export const getBaseByType = (type: MovementType): BaseCategory[] =>
  BASE_CATEGORIES.filter((c) => c.type === type);