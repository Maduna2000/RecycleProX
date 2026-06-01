import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useOrderStore } from '@/stores/orderStore';
import { OfflineBanner } from '@/components/OfflineBanner';
import { COLORS } from '@/constants/theme';

export default function OperatorLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
