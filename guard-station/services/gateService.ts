import api from './api';
import { GATE_ENDPOINTS, CUSTOMER_ENDPOINTS, API_BASE_URL, SESSION_COOKIE_NAME } from '@/constants/api';
import { getStoredToken } from './authService';

export type Purpose = 'sell' | 'buy' | 'visitor' | 'other';

export type CustomerLookupResult = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  customerType: 'casual' | 'account';
  blacklisted: boolean;
  blacklistReason: string | null;
} | null;

export type RepeatVisitInfo = {
  count: number;
  lastVisitAt: string | null;
  lastPurpose: Purpose | null;
};

export type PurposeConfig = {
  purpose: Purpose;
  requireIdPhoto: boolean;
  requireVehiclePhoto: boolean;
  requireFacePhoto: boolean;
};

export type SellOption = {
  id: string;
  label: string;
  colorHex: string | null;
  iconName: string | null;
};

export type CreateGateEntryPayload = {
  purpose: Purpose;
  categoryNames?: string[];
  visitorFirstName: string;
  visitorLastName: string;
  visitorIdNumber: string;
  visitorPhone?: string;
  vehicleReg?: string;
  idPhotoR2Key?: string;
  vehiclePhotoR2Key?: string;
  facePhotoR2Key?: string;
  vehicleExempt?: boolean;
  notes?: string;
};

export type GateEntry = {
  id: string;
  entryNumber: string;
  queueNumber: number | null;
  purpose: Purpose;
  visitorFirstName: string;
  visitorLastName: string;
  vehicleReg: string | null;
  createdAt: string;
};

export async function lookupCustomer(idNumber: string): Promise<CustomerLookupResult> {
  const { data } = await api.get(CUSTOMER_ENDPOINTS.lookup, { params: { idNumber } });
  return data ?? null;
}

export async function getRepeatVisitInfo(idNumber: string): Promise<RepeatVisitInfo> {
  const { data } = await api.get(GATE_ENDPOINTS.repeatVisit, { params: { idNumber } });
  return data;
}

export async function getPurposeConfig(purpose: Purpose): Promise<PurposeConfig> {
  const { data } = await api.get(GATE_ENDPOINTS.purposeConfig(purpose));
  return data;
}

export async function listSellOptions(): Promise<SellOption[]> {
  const { data } = await api.get(GATE_ENDPOINTS.sellOptions);
  return data.options ?? [];
}

export async function createGateEntry(payload: CreateGateEntryPayload): Promise<GateEntry> {
  const { data } = await api.post(GATE_ENDPOINTS.entries, payload);
  return data;
}

export async function checkoutGateEntry(id: string): Promise<GateEntry> {
  const { data } = await api.patch(GATE_ENDPOINTS.checkout(id));
  return data;
}

export type OnSiteEntry = {
  id: string;
  entryNumber: string;
  purpose: Purpose;
  vehicleReg: string | null;
  visitorFirstName: string;
  visitorLastName: string;
  createdAt: string;
};

export async function listOnSiteEntries(search: string, page: number): Promise<{ entries: OnSiteEntry[]; total: number }> {
  const { data } = await api.get(GATE_ENDPOINTS.entries, {
    params: { onSiteOnly: 'true', pageSize: 10, page, ...(search ? { search } : {}) },
  });
  return { entries: data.entries ?? [], total: data.total ?? 0 };
}

// Direct multipart upload to /api/r2/upload with context 'gate_entry' — the
// same route and context the web kiosk's StepPhotos.tsx uses, so an entry's
// photos land at the identical R2 key shape regardless of which client
// captured them. Uses a plain authenticated fetch (not the axios `api`
// instance) since RN's FormData file part needs the {uri, name, type} shape,
// which axios's default transform doesn't handle correctly on Android.
export async function uploadGatePhoto(
  entryTempId: string,
  photoIndex: 0 | 1,
  fileUri: string
): Promise<string> {
  const token = await getStoredToken();
  const form = new FormData();
  form.append('context', 'gate_entry');
  form.append('referenceId', entryTempId);
  form.append('photoIndex', String(photoIndex));
  // @ts-expect-error React Native's FormData accepts this {uri,name,type} shape, unlike the DOM FormData typing
  form.append('file', { uri: fileUri, name: `photo-${photoIndex}.jpg`, type: 'image/jpeg' });

  const res = await fetch(`${API_BASE_URL}/api/r2/upload`, {
    method: 'POST',
    // Both headers point at the same encoded NextAuth JWT — see the
    // identical note in services/api.ts's request interceptor.
    headers: token
      ? { Authorization: `Bearer ${token}`, Cookie: `${SESSION_COOKIE_NAME}=${token}` }
      : undefined,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Upload failed (${res.status})`);
  }
  const { key } = await res.json();
  return key;
}
