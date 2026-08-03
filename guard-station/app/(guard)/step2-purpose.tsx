import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Recycle, ShoppingCart, User, MoreHorizontal, ChevronRight } from 'lucide-react-native';
import { useEntryStore } from '@/stores/entryStore';
import { getPurposeConfig, type Purpose } from '@/services/gateService';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { COLORS } from '@/constants/theme';

const STEPS = ['Visitor', 'Purpose', 'Vehicle', 'Photos', 'Review'];

const DEFAULT_CONFIG = { requireIdPhoto: false, requireVehiclePhoto: true };

const PURPOSES: { value: Purpose; label: string; description: string; icon: typeof Recycle; bg: string; fg: string }[] = [
  { value: 'sell', label: 'To Sell', description: 'Bringing scrap/recyclables to sell', icon: Recycle, bg: 'rgba(16,185,129,0.1)', fg: '#059669' },
  { value: 'buy', label: 'To Buy', description: 'Buying recyclables from us', icon: ShoppingCart, bg: 'rgba(37,99,235,0.1)', fg: COLORS.blue },
  { value: 'visitor', label: 'Visitor', description: 'General visit', icon: User, bg: 'rgba(124,58,237,0.1)', fg: '#7C3AED' },
  { value: 'other', label: 'Other', description: 'Delivery, contractor, etc.', icon: MoreHorizontal, bg: COLORS.gray100, fg: COLORS.gray600 },
];

export default function Step2Purpose() {
  const { setPurpose } = useEntryStore();
  const [loading, setLoading] = useState<Purpose | null>(null);

  async function handleSelect(p: Purpose) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(p);
    let config = DEFAULT_CONFIG;
    try {
      const fetched = await getPurposeConfig(p);
      config = { requireIdPhoto: fetched.requireIdPhoto ?? false, requireVehiclePhoto: fetched.requireVehiclePhoto ?? true };
    } catch {
      // keep defaults — server re-validates required photos at submit time regardless
    }
    setPurpose(p, config);
    setLoading(null);
    router.push(p === 'sell' ? '/(guard)/step3-category' : '/(guard)/step4-vehicle');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgressBar currentStep={2} steps={STEPS} />
      <OfflineBanner />
      <View style={styles.body}>
        <View style={styles.header}>
          <Text style={styles.title}>Reason for Entry</Text>
          <Text style={styles.sub}>Why is this visitor entering the yard?</Text>
        </View>

        <View style={styles.grid}>
          {PURPOSES.map((p) => {
            const Icon = p.icon;
            return (
              <TouchableOpacity
                key={p.value}
                style={styles.card}
                onPress={() => handleSelect(p.value)}
                disabled={loading !== null}
                activeOpacity={0.85}
              >
                <View style={[styles.iconCircle, { backgroundColor: p.bg }]}>
                  <Icon color={p.fg} size={24} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{p.label}</Text>
                  <Text style={styles.cardSub}>{p.description}</Text>
                </View>
                {loading === p.value ? (
                  <ActivityIndicator color={COLORS.gray400} size="small" />
                ) : (
                  <ChevronRight color={COLORS.gray300} size={20} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite },
  body: { flex: 1, padding: 20 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { color: COLORS.navy, fontSize: 20, fontWeight: '800' },
  sub: { color: COLORS.gray500, fontSize: 14, marginTop: 4 },
  grid: { gap: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.gray100, minHeight: 76,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  iconCircle: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardText: { flex: 1 },
  cardTitle: { color: COLORS.gray800, fontSize: 16, fontWeight: '700' },
  cardSub: { color: COLORS.gray500, fontSize: 12, marginTop: 2 },
});
