import React from 'react';
import { View, Text } from 'react-native';
import { COLORS } from '@/constants/theme';

const STEPS = ['Customer', 'Product', 'Weight', 'Photos', 'Confirm', 'Review'];

type StepProgressBarProps = {
  currentStep: number;
};

export function StepProgressBar({ currentStep }: StepProgressBarProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: COLORS.navy,
        gap: 0,
      }}
    >
      {STEPS.map((label, index) => {
        const step = index + 1;
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;
        const isUpcoming = step > currentStep;

        return (
          <React.Fragment key={step}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isCompleted
                    ? COLORS.green
                    : isActive
                    ? COLORS.white
                    : 'rgba(255,255,255,0.2)',
                  borderWidth: isActive ? 2 : 0,
                  borderColor: isActive ? COLORS.green : 'transparent',
                }}
              >
                {isCompleted ? (
                  <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: '700' }}>✓</Text>
                ) : (
                  <Text
                    style={{
                      color: isActive ? COLORS.navy : 'rgba(255,255,255,0.5)',
                      fontSize: 12,
                      fontWeight: '700',
                    }}
                  >
                    {step}
                  </Text>
                )}
              </View>
              <Text
                style={{
                  color: isActive
                    ? COLORS.white
                    : isCompleted
                    ? COLORS.green
                    : 'rgba(255,255,255,0.4)',
                  fontSize: 9,
                  marginTop: 3,
                  fontWeight: isActive ? '600' : '400',
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
            {index < STEPS.length - 1 && (
              <View
                style={{
                  height: 2,
                  flex: 0.3,
                  backgroundColor: isCompleted ? COLORS.green : 'rgba(255,255,255,0.2)',
                  marginBottom: 14,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}
