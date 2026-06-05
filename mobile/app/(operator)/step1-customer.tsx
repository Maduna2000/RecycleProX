import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useOrderStore } from '@/stores/orderStore';
import { searchCustomers } from '@/services/scaleService';
import { StepProgressBar } from '@/components/StepProgressBar';
import { OfflineBanner } from '@/components/OfflineBanner';
import { SkeletonList } from '@/components/ui/SkeletonList';
import { COLORS, MIN_TOUCH_TARGET } from '@/constants/theme';

export default function Step1Customer() {
  const [mode, setMode] = useState<'casual' | 'account'>('casual');
  const [search, setSearch] = useState('');
  const [casualForm, setCasualForm] = useState({ firstName: '', lastName: '', phone: '' });
  const { setCustomer } = useOrderStore();

  const { data: results, isLoading, isFetching } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => searchCustomers(search),
    enabled: mode === 'account' && search.length >= 2,
    staleTime: 30_000,
  });

  const canProceedCasual = casualForm.firstName.trim() && casualForm.lastName.trim();

  const handleCasualNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCustomer({ type: 'casual', ...casualForm });
    router.push('/(operator)/step2-product');
  };

  const handleSelectAccount = (c: NonNullable<typeof results>[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCustomer({
      type: 'account',
      customerId: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      companyName: c.companyName,
    });
    router.push('/(operator)/step2-product');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.offWhite }}>
      <StepProgressBar currentStep={1} />
      <OfflineBanner />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          <Text style={{ color: COLORS.navy, fontSize: 22, fontWeight: '800', marginTop: 20, marginBottom: 20 }}>
            Who is the customer?
          </Text>

          {/* Mode tabs */}
          <View style={{ flexDirection: 'row', backgroundColor: COLORS.gray100, borderRadius: 12, padding: 4, marginBottom: 24 }}>
            {(['casual', 'account'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor: mode === m ? COLORS.white : 'transparent',
                }}
              >
                <Text style={{ color: mode === m ? COLORS.navy : COLORS.gray500, fontWeight: mode === m ? '700' : '400', fontSize: 15 }}>
                  {m === 'casual' ? '🚶 Walk-in' : '🏢 Account'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'casual' ? (
            <View style={{ gap: 14 }}>
              {[
                { label: 'First Name *', field: 'firstName' as const, placeholder: 'e.g. John' },
                { label: 'Last Name *', field: 'lastName' as const, placeholder: 'e.g. Smith' },
                { label: 'Phone (optional)', field: 'phone' as const, placeholder: 'e.g. 072 000 0000' },
              ].map(({ label, field, placeholder }) => (
                <View key={field}>
                  <Text style={{ color: COLORS.gray600, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
                    {label.toUpperCase()}
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: COLORS.white,
                      borderRadius: 12,
                      paddingHorizontal: 16,
                      minHeight: MIN_TOUCH_TARGET + 4,
                      fontSize: 16,
                      color: COLORS.gray800,
                      borderWidth: 1,
                      borderColor: COLORS.gray200,
                    }}
                    placeholder={placeholder}
                    value={casualForm[field]}
                    onChangeText={(v) => setCasualForm((f) => ({ ...f, [field]: v }))}
                    keyboardType={field === 'phone' ? 'phone-pad' : 'default'}
                    returnKeyType="next"
                  />
                </View>
              ))}
            </View>
          ) : (
            <View style={{ flex: 1, gap: 12 }}>
              <TextInput
                style={{
                  backgroundColor: COLORS.white,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  minHeight: MIN_TOUCH_TARGET + 4,
                  fontSize: 16,
                  color: COLORS.gray800,
                  borderWidth: 1,
                  borderColor: COLORS.gray200,
                }}
                placeholder="Search by name or ID..."
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
              />
              {(isLoading || isFetching) && search.length >= 2 ? (
                <SkeletonList rows={4} showAvatar />
              ) : results && results.length > 0 ? (
                <FlatList
                  data={results}
                  keyExtractor={(c) => c.id}
                  renderItem={({ item: c }) => (
                    <TouchableOpacity
                      onPress={() => handleSelectAccount(c)}
                      style={{
                        backgroundColor: COLORS.white,
                        borderRadius: 12,
                        padding: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        borderWidth: 1,
                        borderColor: COLORS.gray200,
                      }}
                    >
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: COLORS.navy + '15',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: COLORS.navy, fontWeight: '700' }}>
                          {c.firstName[0] ?? '?'}{c.lastName[0] ?? '?'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.gray800, fontWeight: '600', fontSize: 15 }}>
                          {c.firstName} {c.lastName}
                        </Text>
                        {c.companyName && (
                          <Text style={{ color: COLORS.gray500, fontSize: 13 }}>{c.companyName}</Text>
                        )}
                      </View>
                      <Text style={{ color: COLORS.green, fontSize: 20 }}>›</Text>
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                  showsVerticalScrollIndicator={false}
                />
              ) : search.length >= 2 ? (
                <Text style={{ color: COLORS.gray500, textAlign: 'center', marginTop: 20 }}>
                  No customers found for "{search}"
                </Text>
              ) : (
                <Text style={{ color: COLORS.gray400, textAlign: 'center', marginTop: 20 }}>
                  Type at least 2 characters to search
                </Text>
              )}
            </View>
          )}
        </View>

        {/* CTA */}
        {mode === 'casual' && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12 }}>
            <TouchableOpacity
              onPress={handleCasualNext}
              disabled={!canProceedCasual}
              style={{
                backgroundColor: canProceedCasual ? COLORS.green : COLORS.gray300,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: 'center',
                minHeight: 54,
              }}
              activeOpacity={0.85}
            >
              <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700' }}>Next →</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
