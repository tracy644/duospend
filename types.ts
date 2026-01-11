export interface CategoryDefinition {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export enum Category {
  MEDICAL = 'Medical',
  HEALTH_FITNESS = 'Health and fitness',
  GROOMING = 'grooming',
  CLOTHES = 'Clothes',
  FOOD = 'Food',
  HOUSEWARES = 'Housewares',
  GAMBLING = 'Gambling',
  ENTERTAINMENT = 'Entertainment',
  GIFTS = 'Gifts',
  GAS = 'Gas',
  AUTO_REPAIRS = 'Auto Stuff/ repairs',
  UTILITIES = 'Utilities',
  TAX_INSURANCE = 'Property, income tax/insurance',
  TRAVEL = 'Travel',
  BEERS = 'Beers',
  DINING_OUT = 'Dining out',
  PETS = 'pets',
  HOUSE_REPAIRS = 'House repairs/ Garage',
  ONE_TIME = 'One time things'
}

export enum UserRole {
  PARTNER_1 = 'PARTNER_1',
  PARTNER_2 = 'PARTNER_2'
}

export interface PartnerNames {
  [UserRole.PARTNER_1]: string;
  [UserRole.PARTNER_2]: string;
}

export interface TransactionSplit {
  categoryName: string;
  amount: number;
}

export interface Transaction {
  id: string;
  totalAmount: number;
  splits: TransactionSplit[];
  date: string; // ISO string
  description: string;
  userId: UserRole;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  icon: string;
}

export interface AppState {
  transactions: Transaction[];
  budgets: Record<string, number>;
  categories: CategoryDefinition[];
  partnerNames: PartnerNames;
  goals: Goal[];
  syncUrl?: string;
  lastSync?: string;
}