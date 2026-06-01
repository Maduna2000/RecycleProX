import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, MIN_TOUCH_TARGET } from '@/constants/theme';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});
type LoginForm = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error, clearError } = useAuthStore();

  const { control, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    clearError();
    try {
      await login(data.username, data.password);
      router.replace('/(operator)');
    } catch {
      // error shown via store.error
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.navy }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={{ alignItems: 'center', marginBottom: 48 }}>
            <Image
              source={require('../../assets/splash-icon.png')}
              style={{ width: 100, height: 100, resizeMode: 'contain', marginBottom: 16 }}
            />
            <Text style={{ color: COLORS.white, fontSize: 26, fontWeight: '800' }}>ScaleStation</Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 4 }}>
              Sign in to continue
            </Text>
          </View>

          {/* Error banner */}
          {error && (
            <View
              style={{
                backgroundColor: '#FEE2E2',
                borderRadius: 10,
                padding: 12,
                marginBottom: 20,
                flexDirection: 'row',
                gap: 8,
              }}
            >
              <Text style={{ flex: 1, color: '#B91C1C', fontSize: 14 }}>{error}</Text>
              <TouchableOpacity onPress={clearError} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: '#B91C1C', fontSize: 18, lineHeight: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Username */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
              USERNAME
            </Text>
            <Controller
              control={control}
              name="username"
              render={({ field: { onChange, value, onBlur } }) => (
                <TextInput
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    minHeight: MIN_TOUCH_TARGET + 4,
                    color: COLORS.white,
                    fontSize: 16,
                    borderWidth: errors.username ? 1 : 0,
                    borderColor: COLORS.red,
                  }}
                  placeholder="Enter your username"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  returnKeyType="next"
                />
              )}
            />
            {errors.username && (
              <Text style={{ color: COLORS.red, fontSize: 12, marginTop: 4 }}>
                {errors.username.message}
              </Text>
            )}
          </View>

          {/* Password */}
          <View style={{ marginBottom: 32 }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
              PASSWORD
            </Text>
            <View style={{ position: 'relative' }}>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value, onBlur } }) => (
                  <TextInput
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      borderRadius: 12,
                      paddingHorizontal: 16,
                      paddingRight: 52,
                      minHeight: MIN_TOUCH_TARGET + 4,
                      color: COLORS.white,
                      fontSize: 16,
                      borderWidth: errors.password ? 1 : 0,
                      borderColor: COLORS.red,
                    }}
                    placeholder="Enter your password"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    secureTextEntry={!showPassword}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit(onSubmit)}
                  />
                )}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 16,
                  top: 0,
                  bottom: 0,
                  justifyContent: 'center',
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 20 }}>
                  {showPassword ? '🙈' : '👁'}
                </Text>
              </TouchableOpacity>
            </View>
            {errors.password && (
              <Text style={{ color: COLORS.red, fontSize: 12, marginTop: 4 }}>
                {errors.password.message}
              </Text>
            )}
          </View>

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading}
            style={{
              backgroundColor: isLoading ? COLORS.green + '80' : COLORS.green,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              minHeight: 54,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 10,
            }}
            activeOpacity={0.85}
          >
            {isLoading && <ActivityIndicator color={COLORS.white} size="small" />}
            <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700' }}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
