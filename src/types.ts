import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'boss' | 'factory' | 'supplier';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  createdAt: Timestamp;
}

export type OrderStatus = 'ready' | 'partial' | 'blocked';

export interface Order {
  id: string;
  model: string;
  reference: string;
  orderNumber: string;
  client: string;
  quantity: number;
  imageUrl?: string;
  exportWeek: string;
  exportDate: string;
  status: OrderStatus;
  receivedPercent?: number;
  arrivedPercent?: number;
  plannedPercent?: number;
  createdAt: Timestamp;
  notes?: string;
  isArchived?: boolean;
}

export type MaterialStatus = 'ok' | 'partial' | 'missing';
export type MaterialUnit = 'meters' | 'units' | 'coils';

export interface Material {
  id: string;
  type: string;
  composition: string;
  consumptionPerUnit: number;
  totalRequired: number;
  totalReceived: number;
  totalArrived: number;
  totalPlanned?: number;
  unit: MaterialUnit;
  status: MaterialStatus;
  linkedImportLines: string[];
  notes?: string;
}

export type BundleStatus = 'waiting_delivery' | 'not_embarked' | 'in_transit' | 'arrived' | 'received';

export interface ImportBundle {
  id: string;
  bundleNumber: string;
  carrier: string;
  expectedDate: string;
  actualArrivalDate?: string;
  status: BundleStatus;
  lineCount: number;
  notes?: string;
  createdAt: Timestamp;
}

export type ImportLineStatus = 'pending' | 'received';

export interface ImportLine {
  id: string;
  bundleId: string;
  description: string;
  quantity: number;
  unit: string;
  linkedOrderId: string;
  linkedMaterialId: string;
  status: ImportLineStatus;
  receivedDate?: string;
  notes?: string;
}

export interface ExportPlan {
  id: string;
  orderId: string;
  orderNumber: string;
  week: string;
  weekDate: string;
  plannedQty: number;
  exportedQty: number;
  remaining: number;
  channel: string;
}

export type NotificationType = 'import_arrived' | 'production_blocked' | 'order_ready' | 'export_due';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  orderId?: string;
  bundleId?: string;
  isRead: boolean;
  createdAt: Timestamp;
  targetRoles: UserRole[];
}
