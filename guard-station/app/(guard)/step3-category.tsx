import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as LucideIcons from 'lucide-react-native';
import { Package, Recycle, Check } from 'lucide-react-native';
import { useEntryStore } from '@/stores/entryStore';
import { listSellOptions, type SellOption } from '@/services/gateService';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { SkeletonGrid } from '@/components/ui/SkeletonList';
import { COLORS } from '@/constants/theme';

const STEPS = ['Visitor', 'Purpose', 'Category', 'Vehicle', 'Photos', 'Review'];

function CatIcon({ name, color }: { name: string | null; color: string }) {
  if (!name) return <Package color={color} size={24} />;
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ color?: string; size?: number }>>)[name];
  return Icon ? <Icon color={color} size={24} /> : <Package color={color} size={24} />;
}

export default function Step3Category() {
  const { setCategoryNames } = useEntryStore();
  const [options, setOptions] = useState<SellOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  function load() {
    setLoading(true);
    setError(null);
    listSellOptions()
      .then(setOptions)
      .catch((err) => {
        setOptions([]);
        // Surfaced rather than silently swallowed into an empty list —
        // an empty list here used to be indistinguishable from "nothing
        // configured yet" vs. "the request actually failed" (e.g. a 401),
        // which made this exact failure mode hard to diagnose.
        setError(err?.response?.status === 401
          ? 'Session expired — sign out and back in to refresh it.'
          : (err?.response?.data?.error ?? err?.message ?? 'Could not load categories.'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function toggle(label: string) {
    Haptics.selectionAsync();
    setSelected((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  }

  function handleNext() {
    if (selected.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCategoryNames(selected);
    router.push('/(guard)/step4-vehicle');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgressBar currentStep={3} steps={STEPS} />
      <OfflineBanner />
      <View style={styles.body}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.iconCircle}><Recycle color="#059669" size={20} /></View>
            <Text style={styles.title}>What are they selling?</Text>
          </View>
          <Text style={styles.sub}>Select one or more options</Text>
        </View>

        {loading ? (
          <SkeletonGrid cols={2} rows={3} itemHeight={100} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={options}
            keyExtractor={(o) => o.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
            ListEmptyComponent={<Text style={styles.empty}>No sell categories configured yet</Text>}
            renderItem={({ item }) => {
              const isSel = selected.includes(item.label);
              const fg = item.colorHex ?? COLORS.gray600;
              const bg = item.colorHex ? `${item.colorHex}22` : COLORS.gray100;
              return (
                <TouchableOpacity
                  style={[styles.card, isSel && styles.cardSelected]}
                  onPress={() => toggle(item.label)}
                  activeOpacity={0.85}
                >
                  {isSel && (
                    <View style={styles.checkBadge}>
                      <Check color={COLORS.white} size={12} strokeWidth={3} />
                    </View>
                  )}
                  <View style={[styles.iconWrap, { backgroundColor: bg }]}>
                    <CatIcon name={item.iconName} color={fg} />
                  </View>
                  <Text style={styles.cardLabel} numberOfLines={2}>{item.label}</Text>
                </TouchableOpacity>
              );
            }}
          />
        )}

        <TouchableOpacity
          style={[styles.nextBtn, selected.length === 0 && styles.btnDisabled]}
          onPress={handleNext}
          disabled={selected.length === 0}
        >
          <Text style={styles.nextBtnText}>Continue →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite },
  body: { flex: 1, padding: 20 },
  header: { marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  iconCircle: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(16,185,129,0.1)', alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.navy, fontSize: 20, fontWeight: '800' },
  sub: { color: COLORS.gray500, fontSize: 14 },
  empty: { color: COLORS.gray400, textAlign: 'center', paddingVertical: 32 },
  errorBox: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  errorText: { color: COLORS.red, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
  retryBtn: { backgroundColor: COLORS.gray100, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 20 },
  retryBtnText: { color: COLORS.gray700, fontSize: 13, fontWeight: '600' },
  card: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.white, borderRadius: 16, padding: 14, minHeight: 100,
    borderWidth: 2, borderColor: COLORS.gray100,
  },
  cardSelected: { borderColor: COLORS.green },
  checkBadge: {
    position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10,
    backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center',
  },
  iconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { color: COLORS.gray800, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  nextBtn: { backgroundColor: COLORS.blue, borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 54, marginTop: 8 },
  btnDisabled: { opacity: 0.4 },
  nextBtnText: { color: COLORS.white, fontSize: 17, fontWeight: '700' },
});
