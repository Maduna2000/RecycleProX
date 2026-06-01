import React from 'react';
import { View, Text, Image, TouchableOpacity, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/theme';

const { height } = Dimensions.get('window');

const FEATURES = [
  { icon: '⚖️', title: 'Multi-product weighing', body: 'Record several products in a single order session.' },
  { icon: '📷', title: 'Mandatory photos', body: 'Capture scale reading + load photos for every line.' },
  { icon: '🧾', title: 'Instant slip', body: 'Generate and share a PDF receipt the moment you submit.' },
];

export default function OnboardingFeatures() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.navy }}>
      <TouchableOpacity
        onPress={() => router.replace('/(auth)/login')}
        style={{ alignSelf: 'flex-end', padding: 16 }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>Skip</Text>
      </TouchableOpacity>

      <View style={{ flex: 1, paddingHorizontal: 32, justifyContent: 'center', gap: 24 }}>
        <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 8 }}>
          Capture. Weigh. Done.
        </Text>
        {FEATURES.map((f) => (
          <View key={f.title} style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: 'rgba(76,175,80,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 22 }}>{f.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>
                {f.title}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 20 }}>
                {f.body}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View
        style={{
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          paddingHorizontal: 32,
          paddingTop: 32,
          paddingBottom: 24,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <View style={{ width: 24, height: 8, borderRadius: 4, backgroundColor: COLORS.green }} />
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' }} />
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(onboarding)/ready')}
          style={{
            backgroundColor: COLORS.green,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            minHeight: 54,
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700' }}>Next</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
