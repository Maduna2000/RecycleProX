import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useOrderStore } from '@/stores/orderStore';
import { fetchCategories, fetchProducts } from '@/services/scaleService';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { SkeletonGrid, SkeletonList } from '@/components/ui/SkeletonList';
import { COLORS, MIN_TOUCH_TARGET } from '@/constants/theme';

const CATEGORY_ICONS: Record<string, string> = {
  Metals: '🔩', Copper: '🟤', Aluminium: '⚪', Steel: '⚙️',
  Paper: '📄', Plastic: '♻️', Glass: '🫙', Rubber: '⚫',
  Electronics: '💻', Batteries: '🔋',
};

export default function Step2Product() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { setProduct } = useOrderStore();

  const { data: categories, isLoading: catLoading } = useQuery({
    queryKey: ['scale-categories'],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });

  const { data: products, isLoading: prodLoading } = useQuery({
    queryKey: ['scale-products', selectedCategory],
    queryFn: () => fetchProducts(selectedCategory ?? undefined),
    enabled: !!selectedCategory,
    staleTime: 5 * 60_000,
  });

  const handleSelectProduct = (product: NonNullable<typeof products>[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setProduct(product);
    router.push('/(operator)/step3-weight');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.offWhite }}>
      <StepProgressBar currentStep={2} />
      <OfflineBanner />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginBottom: 12 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: COLORS.blue, fontSize: 15 }}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={{ color: COLORS.navy, fontSize: 22, fontWeight: '800', marginBottom: 20 }}>
          {selectedCategory ? `Products — ${selectedCategory}` : 'Select a category'}
        </Text>

        {!selectedCategory ? (
          catLoading ? (
            <SkeletonGrid cols={2} rows={3} itemHeight={88} />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {(categories ?? []).map((cat) => (
                <TouchableOpacity
                  key={cat.name}
                  onPress={() => { Haptics.selectionAsync(); setSelectedCategory(cat.name); }}
                  style={{
                    width: '47%',
                    backgroundColor: COLORS.white,
                    borderRadius: 14,
                    padding: 16,
                    alignItems: 'center',
                    gap: 8,
                    borderWidth: 1,
                    borderColor: COLORS.gray200,
                    minHeight: 88,
                    justifyContent: 'center',
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={{ fontSize: 28 }}>{CATEGORY_ICONS[cat.name] ?? '📦'}</Text>
                  <Text style={{ color: COLORS.navy, fontWeight: '700', fontSize: 14, textAlign: 'center' }}>
                    {cat.name}
                  </Text>
                  <Text style={{ color: COLORS.gray400, fontSize: 12 }}>{cat.productCount} products</Text>
                </TouchableOpacity>
              ))}
            </View>
          )
        ) : (
          <>
            <TouchableOpacity
              onPress={() => setSelectedCategory(null)}
              style={{ marginBottom: 16 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ color: COLORS.blue, fontSize: 14 }}>‹ All categories</Text>
            </TouchableOpacity>
            {prodLoading ? (
              <SkeletonList rows={6} />
            ) : (
              <View style={{ gap: 10 }}>
                {(products ?? []).map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => handleSelectProduct(p)}
                    style={{
                      backgroundColor: COLORS.white,
                      borderRadius: 12,
                      padding: 16,
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: COLORS.gray200,
                      minHeight: MIN_TOUCH_TARGET + 8,
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.gray800, fontWeight: '600', fontSize: 15 }}>{p.name}</Text>
                      <Text style={{ color: COLORS.gray500, fontSize: 13, marginTop: 2 }}>
                        {p.code} · {p.unit}
                      </Text>
                    </View>
                    <Text style={{ color: COLORS.green, fontSize: 22 }}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
