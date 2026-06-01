import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useOrderStore } from '@/stores/orderStore';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StepProgressBar } from '@/components/StepProgressBar';
import { COLORS } from '@/constants/theme';

export default function OperatorHome() {
  const { user, logout } = useAuthStore();
  const { step, reset } = useOrderStore();

  const handleLogout = async () => {
    reset();
    await logout();
    router.replace('/(auth)/login');
  };

  const handleNewOrder = () => {
    reset();
    router.push('/(operator)/step1-customer');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.offWhite }}>
      <OfflineBanner />

      {/* Header */}
      <View style={{ backgroundColor: COLORS.navy, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Logged in as</Text>
          <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>
            {user?.fullName ?? user?.username ?? 'Operator'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleLogout}
          style={{ backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' }}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 24 }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            backgroundColor: COLORS.navy,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 36 }}>⚖️</Text>
        </View>
        <Text style={{ color: COLORS.navy, fontSize: 24, fontWeight: '800', textAlign: 'center' }}>
          Scale Station
        </Text>
        <Text style={{ color: COLORS.gray500, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
          Ready to record a weighing order. Tap the button below to begin.
        </Text>

        <TouchableOpacity
          onPress={handleNewOrder}
          style={{
            backgroundColor: COLORS.green,
            borderRadius: 16,
            paddingVertical: 18,
            paddingHorizontal: 48,
            alignItems: 'center',
            minHeight: 56,
            width: '100%',
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '800' }}>
            + New Weighing Order
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
