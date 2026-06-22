import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/useAuth";
import { colors, spacing, typography, radius } from "@/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.kicker}>ACCOUNT</Text>
        <Text style={styles.email}>{user?.email ?? "—"}</Text>
      </View>

      <Pressable style={styles.row} onPress={() => router.push("/subscription")}>
        <Text style={styles.rowLabel}>Upgrade</Text>
        <Text style={styles.rowChevron}>›</Text>
      </Pressable>

      <Pressable style={styles.row} onPress={() => router.push("/settings")}>
        <Text style={styles.rowLabel}>Settings</Text>
        <Text style={styles.rowChevron}>›</Text>
      </Pressable>

      <Pressable style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutBtnText}>Sign Out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.md },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  kicker: { ...typography.label, color: colors.goldMuted, fontSize: 10, letterSpacing: 1 },
  email: { ...typography.title, color: colors.textPrimary, fontSize: 20 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  rowChevron: { ...typography.body, color: colors.textTertiary, fontSize: 18 },
  signOutBtn: {
    marginTop: spacing.lg,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  signOutBtnText: { ...typography.label, color: colors.danger },
});
