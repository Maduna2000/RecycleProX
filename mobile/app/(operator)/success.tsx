import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, Alert, StyleSheet, Animated,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { useOrderStore } from '@/stores/orderStore';
import { getOrderSlipUrl } from '@/services/scaleService';
import { COLORS } from '@/constants/theme';

export default function SuccessScreen() {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [loadingSlip, setLoadingSlip] = React.useState(false);

  const { submittedOrderId, submittedOrderNumber, reset } = useOrderStore();

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.sequence([
      Animated.delay(100),
      Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 150, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(200),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  async function handleViewSlip() {
    if (!submittedOrderId) return;
    setLoadingSlip(true);
    try {
      const url = await getOrderSlipUrl(submittedOrderId);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(url, { mimeType: 'application/pdf', dialogTitle: 'Order Slip' });
      } else {
        Alert.alert('Slip URL', url);
      }
    } catch {
      Alert.alert('Error', 'Could not load the order slip. Try again shortly.');
    } finally {
      setLoadingSlip(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Animated.View style={[styles.checkCircle, { transform: [{ scale }] }]}>
          <Text style={styles.checkmark}>✓</Text>
        </Animated.View>

        <Animated.View style={[styles.info, { opacity }]}>
          <Text style={styles.heading}>Order Saved!</Text>
          {submittedOrderNumber ? (
            <View style={styles.orderNumBox}>
              <Text style={styles.orderNumLabel}>Order Number</Text>
              <Text style={styles.orderNum}>{submittedOrderNumber}</Text>
            </View>
          ) : null}
          <Text style={styles.subText}>
            The weighing order has been recorded successfully.
          </Text>
        </Animated.View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.shareBtn, loadingSlip && styles.btnDisabled]}
          onPress={handleViewSlip}
          disabled={loadingSlip || !submittedOrderId}
          activeOpacity={0.85}
        >
          {loadingSlip && <ActivityIndicator color={COLORS.white} size="small" style={{ marginRight: 8 }} />}
          <Text style={styles.shareBtnText}>
            {loadingSlip ? 'Loading...' : '🧾 View & Share Slip'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.newOrderBtn}
          onPress={() => { reset(); router.replace('/(operator)'); }}
          activeOpacity={0.85}
        >
          <Text style={styles.newOrderBtnText}>+ New Order</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.navy },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 24 },
  checkCircle: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.green,
    alignItems: 'center', justifyContent: 'center',
  },
  checkmark: { color: COLORS.white, fontSize: 52, fontWeight: '800' },
  info: { alignItems: 'center', gap: 8 },
  heading: { color: COLORS.white, fontSize: 28, fontWeight: '800' },
  orderNumBox: {
    backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 10, alignItems: 'center',
  },
  orderNumLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  orderNum: { color: COLORS.white, fontSize: 20, fontWeight: '800' },
  subText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  actions: { paddingHorizontal: 32, paddingBottom: 32, gap: 12 },
  shareBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', minHeight: 54, flexDirection: 'row', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  shareBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
  newOrderBtn: {
    backgroundColor: COLORS.green, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', minHeight: 54,
  },
  newOrderBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
});
