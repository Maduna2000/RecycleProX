import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useOrderStore } from '@/stores/orderStore';
import { usePrinterStore } from '@/stores/printerStore';
import { getOrderSlipUrl } from '@/services/scaleService';
import { buildReceipt } from '@/lib/thermalReceipt';
import { printBytes, isPrinterModuleAvailable } from 'expo-thermal-printer';
import { COLORS } from '@/constants/theme';

type PrintStatus = 'idle' | 'printing' | 'done' | 'error' | 'no-printer';

export default function SuccessScreen() {
  const scale   = useSharedValue(0);
  const opacity = useSharedValue(0);

  const [loadingSlip,  setLoadingSlip]  = useState(false);
  const [printStatus,  setPrintStatus]  = useState<PrintStatus>('idle');
  const [printError,   setPrintError]   = useState('');
  const receiptRef = useRef<number[] | null>(null);

  const { submittedOrderId, submittedOrderNumber, customer, lines, reset } = useOrderStore();
  const { printerAddress, loadSavedAddress } = usePrinterStore();

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    scale.value   = withDelay(100, withSpring(1, { damping: 12, stiffness: 150 }));
    opacity.value = withDelay(200, withTiming(1, { duration: 400 }));
    loadSavedAddress().then(() => autoPrint());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkmarkStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const contentStyle   = useAnimatedStyle(() => ({ opacity: opacity.value }));

  function buildReceiptBytes(): number[] | null {
    if (!submittedOrderNumber || !customer) return null;
    return buildReceipt({
      orderNumber: submittedOrderNumber,
      createdAt:   new Date().toISOString(),
      customer: {
        firstName: customer.firstName,
        lastName:  customer.lastName,
        phone:     customer.type === 'casual' ? customer.phone : (customer as { phone?: string }).phone,
        isAccount: customer.type === 'account',
      },
      lines: lines.map(l => ({
        productName:  l.product.name,
        categoryName: (l.product as { categoryName?: string }).categoryName,
        weight:       String(l.weight),
        unit:         l.product.unit,
      })),
    });
  }

  async function autoPrint() {
    if (!isPrinterModuleAvailable()) return;
    const addr = usePrinterStore.getState().printerAddress;
    if (!addr) {
      setPrintStatus('no-printer');
      return;
    }
    await doPrint(addr);
  }

  async function doPrint(address: string) {
    setPrintStatus('printing');
    setPrintError('');
    try {
      let bytes = receiptRef.current;
      if (!bytes) {
        bytes = buildReceiptBytes();
        if (!bytes) throw new Error('Could not build receipt — order data missing');
        receiptRef.current = bytes;
      }
      await printBytes(address, bytes);
      setPrintStatus('done');
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : 'Print failed');
      setPrintStatus('error');
    }
  }

  async function handlePrint() {
    const addr = printerAddress;
    if (!addr) {
      router.push('/(operator)/printer-setup');
      return;
    }
    await doPrint(addr);
  }

  const handleViewSlip = async () => {
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
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.navy }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 24 }}>
        {/* Checkmark */}
        <Animated.View
          style={[
            { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' },
            checkmarkStyle,
          ]}
        >
          <Text style={{ color: COLORS.white, fontSize: 52, fontWeight: '800' }}>✓</Text>
        </Animated.View>

        <Animated.View style={[{ alignItems: 'center', gap: 8 }, contentStyle]}>
          <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800' }}>Order Saved!</Text>
          {submittedOrderNumber && (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Order Number</Text>
              <Text style={{ color: COLORS.white, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
                {submittedOrderNumber}
              </Text>
            </View>
          )}
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
            The weighing order has been recorded successfully.
          </Text>

          {/* Print status banners */}
          {printStatus === 'printing' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <ActivityIndicator color={COLORS.green} size="small" />
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Sending to printer…</Text>
            </View>
          )}
          {printStatus === 'done' && (
            <Text style={{ color: COLORS.green, fontSize: 14, fontWeight: '600' }}>✓ Slip printed</Text>
          )}
          {printStatus === 'error' && (
            <Text style={{ color: '#FCA5A5', fontSize: 13, textAlign: 'center' }}>
              Print failed: {printError}
            </Text>
          )}
          {printStatus === 'no-printer' && (
            <TouchableOpacity onPress={() => router.push('/(operator)/printer-setup')}>
              <Text style={{ color: COLORS.green, fontSize: 14, textDecorationLine: 'underline' }}>
                Set up printer →
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>

      <View style={{ paddingHorizontal: 32, paddingBottom: 32, gap: 12 }}>

        {/* Print / Reprint button — shown if printer module available */}
        {isPrinterModuleAvailable() && (
          <TouchableOpacity
            onPress={handlePrint}
            disabled={printStatus === 'printing'}
            style={{
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              minHeight: 54,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 10,
              opacity: printStatus === 'printing' ? 0.5 : 1,
            }}
            activeOpacity={0.85}
          >
            {printStatus === 'printing'
              ? <ActivityIndicator color={COLORS.white} size="small" />
              : <Text style={{ fontSize: 18 }}>🖨️</Text>
            }
            <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700' }}>
              {printStatus === 'done' ? 'Reprint Slip' : printStatus === 'error' ? 'Retry Print' : 'Print Slip'}
            </Text>
          </TouchableOpacity>
        )}

        {/* View & Share */}
        <TouchableOpacity
          onPress={handleViewSlip}
          disabled={loadingSlip || !submittedOrderId}
          style={{
            backgroundColor: 'rgba(255,255,255,0.1)',
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
          {loadingSlip && <ActivityIndicator color={COLORS.white} size="small" />}
          <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700' }}>
            {loadingSlip ? 'Loading...' : '🧾 View & Share Slip'}
          </Text>
        </TouchableOpacity>

        {/* New Order */}
        <TouchableOpacity
          onPress={() => { reset(); router.replace('/(operator)'); }}
          style={{
            backgroundColor: COLORS.green,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            minHeight: 54,
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700' }}>+ New Order</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
