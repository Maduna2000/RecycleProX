import React from 'react';
import { View, Text, Image, TouchableOpacity, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/theme';

const { height } = Dimensions.get('window');

export default function OnboardingWelcome() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.navy }}>
      {/* Skip button */}
      <TouchableOpacity
        onPress={() => router.replace('/(auth)/login')}
        style={{ alignSelf: 'flex-end', padding: 16 }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>Skip</Text>
      </TouchableOpacity>

      {/* Illustration area */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Image
          source={require('../../assets/splash-icon.png')}
          style={{ width: height * 0.28, height: height * 0.28, resizeMode: 'contain' }}
        />
      </View>

      {/* Content area */}
      <View
        style={{
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          paddingHorizontal: 32,
          paddingTop: 40,
          paddingBottom: 24,
        }}
      >
        <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '800', marginBottom: 12 }}>
          Welcome to ScaleStation
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, lineHeight: 24, marginBottom: 40 }}>
          Your yard's weighing station, now in your pocket.
        </Text>

        {/* Dot indicators */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
          <View style={{ width: 24, height: 8, borderRadius: 4, backgroundColor: COLORS.green }} />
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' }} />
        </View>

        {/* CTA */}
        <TouchableOpacity
          onPress={() => router.push('/(onboarding)/features')}
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
