import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS } from '@/constants/theme';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to external crash reporter here when available
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ScrollView
          contentContainerStyle={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            backgroundColor: COLORS.navy,
          }}
        >
          <Text style={{ fontSize: 48, marginBottom: 16 }}>⚠️</Text>
          <Text style={{ color: COLORS.white, fontSize: 20, fontWeight: '800', marginBottom: 12, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', marginBottom: 32, lineHeight: 20 }}>
            {this.state.error?.message ?? 'An unexpected error occurred. Please try again.'}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, error: null })}
            style={{
              backgroundColor: COLORS.green,
              paddingVertical: 16,
              paddingHorizontal: 32,
              borderRadius: 14,
              minHeight: 54,
              alignItems: 'center',
            }}
            activeOpacity={0.85}
          >
            <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700' }}>Try Again</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}
