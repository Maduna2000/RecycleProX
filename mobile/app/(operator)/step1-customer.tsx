import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useOrderStore } from '@/stores/orderStore';
import { searchCustomers, CustomerSearchResult } from '@/services/scaleService';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { COLORS } from '@/constants/theme';

type Mode = 'casual' | 'account';

export default function Step1Customer() {
  const [mode, setMode] = useState<Mode>('casual');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setCustomer } = useOrderStore();

  useEffect(() => {
    if (mode !== 'account') return;
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchCustomers(query.trim())); }
      catch { setResults([]); }
      finally { setSearching(false); }
    }, 400);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, mode]);

  function selectCasual() {
    if (!firstName.trim() || !lastName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCustomer({ type: 'casual', firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() });
    router.push('/(operator)/step2-product');
  }

  function selectAccount(c: CustomerSearchResult) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCustomer({ type: 'account', customerId: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone });
    router.push('/(operator)/step2-product');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgressBar currentStep={1} />
      <OfflineBanner />

      <View style={styles.header}>
        <Text style={styles.title}>Customer</Text>
        <Text style={styles.sub}>Walk-in or account customer?</Text>
      </View>

      <View style={styles.tabs}>
        {(['casual', 'account'] as Mode[]).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.tab, mode === m && styles.tabActive]}
            onPress={() => setMode(m)}
          >
            <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
              {m === 'casual' ? 'Walk-in' : 'Account'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'casual' ? (
        <View style={styles.form}>
          <Text style={styles.label}>First Name *</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName}
            placeholder="e.g. John" placeholderTextColor={COLORS.gray400} autoCapitalize="words" />
          <Text style={styles.label}>Last Name *</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName}
            placeholder="e.g. Smith" placeholderTextColor={COLORS.gray400} autoCapitalize="words" />
          <Text style={styles.label}>Phone (optional)</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone}
            placeholder="e.g. 076 123 4567" placeholderTextColor={COLORS.gray400} keyboardType="phone-pad" />
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>Search by name or ID</Text>
          <TextInput style={styles.input} value={query} onChangeText={setQuery}
            placeholder="Type at least 2 characters..." placeholderTextColor={COLORS.gray400} autoCapitalize="none" />
          {searching && <ActivityIndicator color={COLORS.green} style={{ marginTop: 8 }} />}
          <FlatList
            data={results}
            keyExtractor={c => c.id}
            style={{ maxHeight: 240 }}
            renderItem={({ item: c }) => (
              <TouchableOpacity style={styles.resultRow} onPress={() => selectAccount(c)}>
                <Text style={styles.resultName}>{c.firstName} {c.lastName}</Text>
                {c.phone ? <Text style={styles.resultSub}>{c.phone}</Text> : null}
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <View style={styles.footer}>
        {mode === 'casual' && (
          <TouchableOpacity
            style={[styles.nextBtn, (!firstName.trim() || !lastName.trim()) && styles.btnDisabled]}
            onPress={selectCasual}
            disabled={!firstName.trim() || !lastName.trim()}
          >
            <Text style={styles.nextBtnText}>Next →</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite },
  header: { padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  title: { color: COLORS.navy, fontSize: 22, fontWeight: '800', marginBottom: 2 },
  sub: { color: COLORS.gray500, fontSize: 14 },
  tabs: { flexDirection: 'row', margin: 20, backgroundColor: COLORS.gray100, borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: COLORS.white, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  tabText: { color: COLORS.gray500, fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: COLORS.navy },
  form: { flex: 1, paddingHorizontal: 20 },
  label: { color: COLORS.gray600, fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 12 },
  input: {
    backgroundColor: COLORS.white, borderRadius: 10, padding: 14,
    color: COLORS.gray800, fontSize: 16, borderWidth: 1, borderColor: COLORS.gray200,
  },
  resultRow: { backgroundColor: COLORS.white, padding: 14, borderRadius: 10, marginTop: 6, borderWidth: 1, borderColor: COLORS.gray200 },
  resultName: { color: COLORS.gray800, fontWeight: '600', fontSize: 15 },
  resultSub: { color: COLORS.gray500, fontSize: 13, marginTop: 2 },
  footer: { padding: 20 },
  nextBtn: { backgroundColor: COLORS.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 54 },
  btnDisabled: { opacity: 0.4 },
  nextBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
});
