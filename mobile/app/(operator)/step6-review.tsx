import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useOrderStore } from '@/stores/orderStore';
import { createOrder } from '@/services/scaleService';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { COLORS, MIN_TOUCH_TARGET } from '@/constants/theme';

export default function Step6Review() {
  const [submitting, setSubmitting] = useState(false);
  const { customer, lines, setSubmittedOrder } = useOrderStore();

  const customerName = customer
    ? `${customer.firstName} ${customer.lastName}`
    : '—';
  const customerLabel = customer?.type === 'account' ? 'Account customer' : 'Walk-in';

  const handleSubmit = async () => {
    if (!customer) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const payload = {
        customer:
          customer.type === 'account'
            ? { type: 'account' as const, customerId: customer.customerId }
            : { type: 'casual' as const, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone },
        lines: lines.map((l) => ({
          productId: l.product.id,
          weight: l.weight,
          photoR2Keys: l.photoR2Keys,
        })),
      };
      const order = await createOrder(payload);
      setSubmittedOrder(order.id, order.orderNumber);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(operator)/success');
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Submission Failed',
        'Could not save the order. Your data is still here — please try again.',
        [{ text: 'Retry', onPress: handleSubmit }, { text: 'Cancel', style: 'cancel' }]
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.offWhite }}>
      <StepProgressBar currentStep={6} />
      <OfflineBanner />

      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: COLORS.blue, fontSize: 15, marginBottom: 12 }}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={{ color: COLORS.navy, fontSize: 22, fontWeight: '800', marginBottom: 4 }}>
            Review Order
          </Text>
          <Text style={{ color: COLORS.gray500, fontSize: 14 }}>
            Confirm everything looks correct before submitting
          </Text>
        </View>

        {/* Customer */}
        <View style={{ margin: 20, backgroundColor: COLORS.white, borderRadius: 14, padding: 16, gap: 4, borderWidth: 1, borderColor: COLORS.gray200 }}>
          <Text style={{ color: COLORS.gray500, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
            Customer
          </Text>
          <Text style={{ color: COLORS.gray800, fontSize: 16, fontWeight: '700' }}>{customerName}</Text>
          <Text style={{ color: COLORS.gray500, fontSize: 13 }}>{customerLabel}</Text>
        </View>

        {/* Lines */}
        <FlatList
          data={lines}
          keyExtractor={(line, i) => `${line.product.id}_${i}`}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
          ListHeaderComponent={
            <Text style={{ color: COLORS.gray600, fontWeight: '700', fontSize: 13, textTransform: 'uppercase', marginBottom: 4 }}>
              {lines.length} product{lines.length > 1 ? 's' : ''}
            </Text>
          }
          renderItem={({ item: line, index }) => (
            <View
              style={{
                backgroundColor: COLORS.white,
                borderRadius: 12,
                padding: 16,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: COLORS.gray200,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.gray800, fontWeight: '600', fontSize: 15 }}>
                  {line.product.name}
                </Text>
                <Text style={{ color: COLORS.gray500, fontSize: 12, marginTop: 2 }}>
                  📷 {line.photoR2Keys.length} photo{line.photoR2Keys.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={{ backgroundColor: COLORS.navy + '10', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                <Text style={{ color: COLORS.navy, fontWeight: '800', fontSize: 16 }}>
                  {line.weight} {line.product.unit}
                </Text>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* Submit */}
      <View style={{ padding: 20 }}>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={{
            backgroundColor: submitting ? COLORS.green + '80' : COLORS.green,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            minHeight: 54,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 10,
          }}
          activeOpacity={0.85}
        >
          {submitting && <ActivityIndicator color={COLORS.white} size="small" />}
          <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700' }}>
            {submitting ? 'Submitting...' : 'Submit Order'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
