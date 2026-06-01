import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Skeleton } from './Skeleton';

type SkeletonListProps = {
  rows?: number;
  rowHeight?: number;
  gap?: number;
  style?: ViewStyle;
  showAvatar?: boolean;
};

export function SkeletonList({
  rows = 5,
  rowHeight = 60,
  gap = 12,
  style,
  showAvatar = false,
}: SkeletonListProps) {
  return (
    <View style={[{ gap }, style]}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {showAvatar && (
            <Skeleton width={40} height={40} borderRadius={20} />
          )}
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={rowHeight * 0.35} borderRadius={6} />
            <Skeleton width="60%" height={rowHeight * 0.25} borderRadius={6} />
          </View>
        </View>
      ))}
    </View>
  );
}

type SkeletonGridProps = {
  cols?: number;
  rows?: number;
  itemHeight?: number;
  gap?: number;
};

export function SkeletonGrid({ cols = 2, rows = 3, itemHeight = 80, gap = 12 }: SkeletonGridProps) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <View key={rowIdx} style={{ flexDirection: 'row', gap }}>
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Skeleton key={colIdx} width={`${Math.floor(100 / cols) - 2}%` as `${number}%`} height={itemHeight} borderRadius={12} />
          ))}
        </View>
      ))}
    </View>
  );
}
