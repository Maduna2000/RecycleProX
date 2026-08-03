import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Search, LogOut, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react-native';
import { listOnSiteEntries, checkoutGateEntry, type OnSiteEntry } from '@/services/gateService';
import { COLORS } from '@/constants/theme';

const PAGE_SIZE = 10;

function useDebounce<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function CheckOutScreen() {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<OnSiteEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 300);
  const prevQueryRef = useRef(debouncedQuery);

  const fetchEntries = useCallback(async (search: string, pg: number) => {
    setLoading(true);
    try {
      const { entries: fetched, total: fetchedTotal } = await listOnSiteEntries(search, pg);
      if (fetched.length === 0 && pg > 1 && fetchedTotal > 0) {
        setPage(pg - 1);
        return;
      }
      setEntries(fetched);
      setTotal(fetchedTotal);
    } catch {
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const changed = prevQueryRef.current !== debouncedQuery;
    prevQueryRef.current = debouncedQuery;
    if (changed) {
      setPage(1);
      fetchEntries(debouncedQuery, 1);
    } else {
      fetchEntries(debouncedQuery, page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, page]);

  async function handleCheckout(id: string) {
    setCheckingOut(id);
    setError(null);
    try {
      await checkoutGateEntry(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await fetchEntries(debouncedQuery, page);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Failed to check out — please try again.');
    } finally {
      setCheckingOut(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.iconCircle}><LogOut color={COLORS.gray700} size={20} /></View>
          <Text style={styles.title}>Check Out</Text>
        </View>
        <Text style={styles.sub}>Find a vehicle or visitor currently on site</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.searchBox}>
          <Search color={COLORS.gray400} size={18} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Name, ID number or vehicle reg…"
            placeholderTextColor={COLORS.gray400}
            autoFocus
          />
          {loading && <ActivityIndicator color={COLORS.gray400} size="small" />}
        </View>

        {error && (
          <View style={styles.errorBox}>
            <AlertCircle color={COLORS.red} size={16} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ gap: 10, paddingVertical: 12 }}
          ListEmptyComponent={!loading ? (
            <Text style={styles.empty}>
              {query.trim() ? 'No matching entries on site' : 'No one currently on site'}
            </Text>
          ) : null}
          renderItem={({ item }) => (
            <View style={styles.entryRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryName} numberOfLines={1}>{item.visitorFirstName} {item.visitorLastName}</Text>
                <Text style={styles.entrySub} numberOfLines={1}>
                  {item.entryNumber}{item.vehicleReg ? ` · ${item.vehicleReg}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.checkoutBtn, checkingOut === item.id && styles.btnDisabled]}
                onPress={() => handleCheckout(item.id)}
                disabled={checkingOut === item.id}
              >
                {checkingOut === item.id ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <>
                    <LogOut color={COLORS.white} size={14} />
                    <Text style={styles.checkoutBtnText}>Check Out</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        />

        {total > PAGE_SIZE && (
          <View style={styles.pager}>
            <TouchableOpacity
              style={styles.pagerBtn}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft color={page <= 1 ? COLORS.gray300 : COLORS.gray600} size={16} />
              <Text style={[styles.pagerText, page <= 1 && styles.pagerTextDisabled]}>Prev</Text>
            </TouchableOpacity>
            <Text style={styles.pagerInfo}>Page {page} of {totalPages} · {total} on site</Text>
            <TouchableOpacity
              style={styles.pagerBtn}
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              <Text style={[styles.pagerText, page >= totalPages && styles.pagerTextDisabled]}>Next</Text>
              <ChevronRight color={page >= totalPages ? COLORS.gray300 : COLORS.gray600} size={16} />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft color={COLORS.gray500} size={16} />
          <Text style={styles.backBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite },
  header: { padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  iconCircle: { width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.navy, fontSize: 20, fontWeight: '800' },
  sub: { color: COLORS.gray500, fontSize: 14 },
  body: { flex: 1, padding: 20 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.white,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.gray200,
  },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.gray800 },
  errorBox: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.redLight, borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { color: '#B91C1C', fontSize: 13, fontWeight: '500', flex: 1 },
  empty: { color: COLORS.gray400, textAlign: 'center', paddingVertical: 32 },
  entryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.white,
    borderRadius: 12, padding: 14,
  },
  entryName: { color: COLORS.gray800, fontWeight: '700', fontSize: 15 },
  entrySub: { color: COLORS.gray500, fontSize: 12, marginTop: 2 },
  checkoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.navy,
    borderRadius: 10, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  checkoutBtnText: { color: COLORS.white, fontSize: 13, fontWeight: '600' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  pagerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 8 },
  pagerText: { color: COLORS.gray600, fontSize: 13, fontWeight: '600' },
  pagerTextDisabled: { color: COLORS.gray300 },
  pagerInfo: { color: COLORS.gray500, fontSize: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, marginTop: 4 },
  backBtnText: { color: COLORS.gray500, fontSize: 13, fontWeight: '600' },
});
