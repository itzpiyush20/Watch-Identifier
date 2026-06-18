import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "@/theme";

interface Props {
  on: boolean;
  onToggle: () => void;
}

/** Simple icon-text flash toggle. Replace Text with an SVG icon in Phase 6. */
export function FlashToggle({ on, onToggle }: Props) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={12}
      style={styles.btn}
      accessibilityLabel={on ? "Flash on" : "Flash off"}
      accessibilityRole="button"
    >
      <Text style={[styles.icon, on && styles.iconOn]}>
        {on ? "⚡" : "⚡"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  icon: { fontSize: 20, color: colors.textSecondary },
  iconOn: { color: colors.gold },
});
