import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '@/constants/theme';

async function completeOnboarding() {
  await AsyncStorage.setItem('onboarding_complete', 'true');
  router.replace('/(auth)/login');
}

export default function OnboardingReady() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.navy }}>
      <View style={{ flex: 1, paddingHorizontal: 32, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
        {/* Big icon */}
        <View
          style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: 'rgba(76,175,80,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 48 }}>✅</Text>
        </View>

        <Text style={{ color: COLORS.white, fontSize: 30, fontWeight: '800', textAlign: 'center' }}>
          You're all set!
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, textAlign: 'center', lineHeight: 24 }}>
          Make sure you have your operator login details ready before continuing.
        </Text>

        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: 16,
            width: '100%',
            gap: 10,
          }}
        >
          {['Your username from your manager', 'Your password or PIN', 'A working internet connection'].map(
            (item) => (
              <View key={item} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Text style={{ color: COLORS.green, fontSize: 16 }}>•</Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>{item}</Text>
              </View>
            )
          )}
        </View>
      </View>

      <View style={{ paddingHorizontal: 32, paddingBottom: 24, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <View style={{ width: 24, height: 8, borderRadius: 4, backgroundColor: COLORS.green }} />
        </View>
        <TouchableOpacity
          onPress={completeOnboarding}
          style={{
            backgroundColor: COLORS.green,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            minHeight: 54,
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700' }}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
