import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/stores/authStore';
import { useOrderStore } from '@/stores/orderStore';
import { COLORS } from '@/constants/theme';

// Matches orderStore's step numbering (1=customer..6=review) — used only to
// resume an in-progress order after the app was relaunched or remounted
// (network-drop error recovery, memory-pressure kill). See orderStore.ts's
// persist() config for why the data survives that in the first place.
const STEP_ROUTES: Record<1 | 2 | 3 | 4 | 5 | 6, Href> = {
  1: '/(operator)/step1-customer',
  2: '/(operator)/step2-product',
  3: '/(operator)/step3-weight',
  4: '/(operator)/step4-photos',
  5: '/(operator)/step5-confirm',
  6: '/(operator)/step6-review',
};

export default function OperatorHome() {
  const { user, logout } = useAuthStore();
  const { reset, customer, lines, step, submittedOrderId } = useOrderStore();

  const hasInProgressOrder = !submittedOrderId && (step > 1 || customer !== null || lines.length > 0);

  function handleNewOrder() {
    reset();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(operator)/step1-customer');
  }

  function handleResumeOrder() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(STEP_ROUTES[step]);
  }

  async function handleLogout() {
    await logout();
    router.replace('/(auth)/login');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello,</Text>
          <Text style={styles.name}>{user?.fullName ?? user?.username ?? 'Operator'}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {hasInProgressOrder && (
          <View style={[styles.card, styles.resumeCard]}>
            <Text style={styles.resumeTitle}>Order in progress</Text>
            <Text style={styles.cardSub}>
              {customer ? `${customer.firstName} ${customer.lastName}` : 'Unsaved order'}
              {lines.length > 0 ? ` · ${lines.length} line${lines.length > 1 ? 's' : ''} added` : ''}
            </Text>
            <TouchableOpacity style={styles.resumeBtn} onPress={handleResumeOrder} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Resume Order →</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ready to weigh?</Text>
          <Text style={styles.cardSub}>
            Capture customer info, products, photos and generate a receipt slip.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleNewOrder} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>+ New Weighing Order</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite ?? '#F8F9FA' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.navy, paddingHorizontal: 20, paddingVertical: 16,
  },
  greeting: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  name: { color: COLORS.white, fontSize: 18, fontWeight: '800' },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  logoutText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  body: { flex: 1, padding: 20, justifyContent: 'center', gap: 16 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  cardTitle: { color: COLORS.navy, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  cardSub: { color: COLORS.gray500 ?? '#6B7280', fontSize: 14, lineHeight: 20, marginBottom: 24 },
  primaryBtn: {
    backgroundColor: COLORS.green, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', minHeight: 54,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
  resumeCard: { borderWidth: 2, borderColor: COLORS.blue },
  resumeTitle: { color: COLORS.blue, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  resumeBtn: {
    backgroundColor: COLORS.blue, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', minHeight: 54,
  },
});
