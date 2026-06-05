import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useOrderStore } from '@/stores/orderStore';
import { createOrder } from '@/services/scaleService';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { COLORS } from '@/constants/theme';

export default function Step6Review() {
  const [submitting, setSubmitting] = useState(false);
  const { customer, lines, setSubmittedOrder } = useOrderStore();

  const customerName = customer ? `${customer.firstName} ${customer.lastName}` : '—';
  const customerLabel = customer?.type === 'account' ? 'Account customer' : 'Walk-in';

  async function handleSubmit() {
    if (!customer) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const payload = {
        customer:
          customer.type === 'account'
            ? { type: 'account' as const, customerId: customer.customerId }
            : { type: 'casual' as const, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone },
        lines: lines.map(l => ({
          productId: l.product.id,
          weight: l.weight,
          photoR2Keys: l.photoR2Keys,
        })),
      };
      const order = await createOrder(payload);
      setSubmittedOrder(order.id, order.orderNumber);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(operator)/success');
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Submission Failed',
        'Could not save the order. Your data is still here — please try again.',
        [{ text: 'Retry', onPress: handleSubmit }, { text: 'Cancel', style: 'cancel' }]
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgressBar currentStep={6} />
      <OfflineBanner />

      <View style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.back}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Review Order</Text>
          <Text style={styles.sub}>Confirm everything before submitting</Text>
        </View>

        <View style={styles.customerCard}>
          <Text style={styles.sectionLabel}>Customer</Text>
          <Text style={styles.customerName}>{customerName}</Text>
          <Text style={styles.customerType}>{customerLabel}</Text>
        </View>

        <FlatList
          data={lines}
          keyExtractor={(line, i) => `${line.product.id}_${i}`}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
          ListHeaderComponent={
            <Text style={styles.sectionLabel2}>
              {lines.length} product{lines.length !== 1 ? 's' : ''}
            </Text>
          }
          renderItem={({ item: line }) => (
            <View style={styles.lineRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{line.product.name}</Text>
                <Text style={styles.linePhotos}>
                  {line.photoR2Keys.length} photo{line.photoR2Keys.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.weightBadge}>
                <Text style={styles.weightText}>{line.weight} {line.product.unit}</Text>
              </View>
            </View>
          )}
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting && <ActivityIndicator color={COLORS.white} size="small" style={{ marginRight: 8 }} />}
          <Text style={styles.submitBtnText}>{submitting ? 'Submitting...' : 'Submit Order'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite },
  flex: { flex: 1 },
  header: { padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  back: { color: COLORS.blue, fontSize: 15, marginBottom: 10 },
  title: { color: COLORS.navy, fontSize: 22, fontWeight: '800', marginBottom: 2 },
  sub: { color: COLORS.gray500, fontSize: 14 },
  customerCard: {
    margin: 20, backgroundColor: COLORS.white, borderRadius: 14, padding: 16,
    gap: 4, borderWidth: 1, borderColor: COLORS.gray200,
  },
  sectionLabel: { color: COLORS.gray500, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  sectionLabel2: { color: COLORS.gray600, fontWeight: '700', fontSize: 13, textTransform: 'uppercase', marginBottom: 4 },
  customerName: { color: COLORS.gray800, fontSize: 16, fontWeight: '700' },
  customerType: { color: COLORS.gray500, fontSize: 13 },
  lineRow: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.gray200,
  },
  lineName: { color: COLORS.gray800, fontWeight: '600', fontSize: 15 },
  linePhotos: { color: COLORS.gray500, fontSize: 12, marginTop: 2 },
  weightBadge: { backgroundColor: COLORS.navy + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  weightText: { color: COLORS.navy, fontWeight: '800', fontSize: 15 },
  footer: { padding: 20 },
  submitBtn: {
    backgroundColor: COLORS.green, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', minHeight: 54, flexDirection: 'row', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  submitBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
});
