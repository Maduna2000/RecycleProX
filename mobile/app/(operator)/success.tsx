import React, { useEffect } from 'react';
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
import { getOrderSlipUrl } from '@/services/scaleService';
import { COLORS } from '@/constants/theme';

export default function SuccessScreen() {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const [loadingSlip, setLoadingSlip] = React.useState(false);
  const { submittedOrderId, submittedOrderNumber, reset } = useOrderStore();

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    scale.value = withDelay(100, withSpring(1, { damping: 12, stiffness: 150 }));
    opacity.value = withDelay(200, withTiming(1, { duration: 400 }));
  }, [opacity, scale]);

  const checkmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

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

  const handleNewOrder = () => {
    reset();
    router.replace('/(operator)');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.navy }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 24 }}>
        {/* Checkmark */}
        <Animated.View
          style={[
            {
              width: 100,
              height: 100,
              borderRadius: 50,
              backgroundColor: COLORS.green,
              alignItems: 'center',
              justifyContent: 'center',
            },
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
        </Animated.View>
      </View>

      <View style={{ paddingHorizontal: 32, paddingBottom: 32, gap: 12 }}>
        <TouchableOpacity
          onPress={handleViewSlip}
          disabled={loadingSlip || !submittedOrderId}
          style={{
            backgroundColor: 'rgba(255,255,255,0.15)',
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

        <TouchableOpacity
          onPress={handleNewOrder}
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
