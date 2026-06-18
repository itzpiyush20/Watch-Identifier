import React from "react";
import { Pressable, View, StyleSheet, ActivityIndicator } from "react-native";
import { colors } from "@/theme";

interface Props {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function CaptureButton({ onPress, disabled = false, loading = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={16}
      style={({ pressed }) => [styles.outer, pressed && styles.outerPressed]}
      accessibilityLabel="Capture watch"
      accessibilityRole="button"
    >
      <View style={styles.ring}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.gold} />
        ) : (
          <View style={[styles.inner, disabled && styles.innerDisabled]} />
        )}
      </View>
    </Pressable>
  );
}

const OUTER = 80;
const RING = 72;
const INNER = 56;

const styles = StyleSheet.create({
  outer: {
    width: OUTER,
    height: OUTER,
    borderRadius: OUTER / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  outerPressed: { opacity: 0.75 },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 3,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  inner: {
    width: INNER,
    height: INNER,
    borderRadius: INNER / 2,
    backgroundColor: colors.gold,
  },
  innerDisabled: {
    backgroundColor: colors.goldMuted,
  },
});
