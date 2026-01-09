
export interface CategoryDefinition {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export enum UserRole {
  PARTNER_1 = 'PARTNER_1',
  PARTNER_2 = 'PARTNER_2'
}

export enum Category {
  FOOD = 'FOOD',
  RENT = 'RENT',
  ENTERTAINMENT = 'ENTERTAINMENT',
  SHOPPING = 'SHOPPING',
  TRANSPORT = 'TRANSPORT',
  HEALTH = 'HEALTH',
  TRAVEL = 'TRAVEL',
  OTHER = 'OTHER'
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

export interface AppState {
  transactions: Transaction[];
  budgets: Record<string, number>;
  categories: CategoryDefinition[];
  partnerNames: PartnerNames;
  syncUrl?: string;
  lastSync?: string;
}
