import api from './api';
import { SCALE_ENDPOINTS } from '@/constants/api';

export type Category = {
  name: string;
  icon?: string;
  productCount: number;
};

export type Product = {
  id: string;
  name: string;
  code: string;
  unit: 'kg' | 'ton' | 'each' | 'litre';
  category: string;
  defaultBuyPrice: string;
};

export type CustomerSearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  idNumber?: string;
  phone?: string;
  customerType: 'casual' | 'account';
  companyName?: string;
};

export type CreateOrderPayload = {
  customer: {
    type: 'casual' | 'account';
    customerId?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  lines: Array<{
    productId: string;
    weight: number;
    photoR2Keys: string[];
  }>;
};

export type ScaleOrder = {
  id: string;
  orderNumber: string;
  status: 'pending' | 'processed' | 'voided';
  createdAt: string;
  customer: { firstName: string; lastName: string };
  lines: Array<{ product: Product; weight: number }>;
  slipR2Key?: string;
};

export async function fetchCategories(): Promise<Category[]> {
  const { data } = await api.get(SCALE_ENDPOINTS.categories);
  return data.categories ?? data;
}

export async function fetchProducts(category?: string): Promise<Product[]> {
  const params = category ? { category } : {};
  const { data } = await api.get(SCALE_ENDPOINTS.products, { params });
  return data.products ?? data;
}

export async function searchCustomers(query: string): Promise<CustomerSearchResult[]> {
  const { data } = await api.get('/api/customers/lookup', {
    params: { q: query, type: 'account' },
  });
  return data.customers ?? data;
}

export async function createOrder(payload: CreateOrderPayload): Promise<ScaleOrder> {
  const { data } = await api.post(SCALE_ENDPOINTS.orders, payload);
  return data.order ?? data;
}

export async function getOrderSlipUrl(orderId: string): Promise<string> {
  const { data } = await api.get(SCALE_ENDPOINTS.orderSlip(orderId));
  return data.url ?? data.slipUrl;
}

export async function getPresignedUploadUrl(
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; r2Key: string }> {
  const { data } = await api.post('/api/r2/upload-url', { filename, contentType });
  return data;
}

export async function uploadToR2(
  uploadUrl: string,
  fileUri: string,
  contentType: string
): Promise<void> {
  const response = await fetch(fileUri);
  const blob = await response.blob();
  await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': contentType },
  });
}
