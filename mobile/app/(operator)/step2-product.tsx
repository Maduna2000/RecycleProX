import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useOrderStore } from '@/stores/orderStore';
import { fetchCategories, fetchProducts, Category, Product } from '@/services/scaleService';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { COLORS } from '@/constants/theme';

export default function Step2Product() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState('');
  const { setProduct } = useOrderStore();

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => setError('Could not load categories'))
      .finally(() => setLoadingCats(false));
  }, []);

  useEffect(() => {
    if (!selectedCategory) return;
    setLoadingProducts(true);
    setProducts([]);
    fetchProducts(selectedCategory)
      .then(setProducts)
      .catch(() => setError('Could not load products'))
      .finally(() => setLoadingProducts(false));
  }, [selectedCategory]);

  function pickProduct(p: Product) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setProduct(p);
    router.push('/(operator)/step3-weight');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgressBar currentStep={2} />
      <OfflineBanner />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Product</Text>
        <Text style={styles.sub}>{selectedCategory ? `Category: ${selectedCategory}` : 'Select a category'}</Text>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {!selectedCategory ? (
        loadingCats ? (
          <ActivityIndicator color={COLORS.green} style={{ marginTop: 32 }} />
        ) : (
          <FlatList
            data={categories}
            keyExtractor={c => c.name}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item: cat }) => (
              <TouchableOpacity style={styles.catRow} onPress={() => setSelectedCategory(cat.name)}>
                <Text style={styles.catName}>{cat.name}</Text>
                <Text style={styles.catCount}>{cat.productCount} items</Text>
              </TouchableOpacity>
            )}
          />
        )
      ) : (
        <>
          <TouchableOpacity style={styles.changeCat} onPress={() => setSelectedCategory(null)}>
            <Text style={styles.changeCatText}>← Change category</Text>
          </TouchableOpacity>
          {loadingProducts ? (
            <ActivityIndicator color={COLORS.green} style={{ marginTop: 32 }} />
          ) : (
            <FlatList
              data={products}
              keyExtractor={p => p.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              renderItem={({ item: p }) => (
                <TouchableOpacity style={styles.productRow} onPress={() => pickProduct(p)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName}>{p.name}</Text>
                    {p.code ? <Text style={styles.productCode}>{p.code}</Text> : null}
                  </View>
                  <View style={styles.unitBadge}>
                    <Text style={styles.unitText}>{p.unit}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.offWhite },
  header: { padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  back: { color: COLORS.blue, fontSize: 15, marginBottom: 10 },
  title: { color: COLORS.navy, fontSize: 22, fontWeight: '800', marginBottom: 2 },
  sub: { color: COLORS.gray500, fontSize: 14 },
  errorText: { color: COLORS.red, textAlign: 'center', margin: 16 },
  catRow: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.gray200,
  },
  catName: { color: COLORS.gray800, fontWeight: '700', fontSize: 16 },
  catCount: { color: COLORS.gray400, fontSize: 13 },
  changeCat: { paddingHorizontal: 20, paddingVertical: 10 },
  changeCatText: { color: COLORS.blue, fontSize: 14, fontWeight: '600' },
  productRow: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16,
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.gray200,
  },
  productName: { color: COLORS.gray800, fontWeight: '600', fontSize: 15 },
  productCode: { color: COLORS.gray500, fontSize: 12, marginTop: 2 },
  unitBadge: { backgroundColor: COLORS.navy + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  unitText: { color: COLORS.navy, fontWeight: '700', fontSize: 13 },
});
