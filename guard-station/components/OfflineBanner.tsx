import React from 'react';
import { View, Text } from 'react-native';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { COLORS } from '@/constants/theme';

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  if (isOnline) return null;

  return (
    <View
      style={{
        backgroundColor: COLORS.amber,
        paddingVertical: 8,
        paddingHorizontal: 16,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: '#92400E', fontWeight: '600', fontSize: 13 }}>
        No internet connection — check your network
      </Text>
    </View>
  );
}
