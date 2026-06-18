import { View, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, spacing, typography, radius } from "@/theme";

/**
 * Entry screen — bridges Phase 1 placeholder to the real scanner.
 * Will become an authenticated home/collection screen in Phase 5.
 */
export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.center}>
        <Text style={styles.kicker}>OFFLINE-FIRST · ANDROID</Text>
        <Text style={styles.title}>The Watch{"\n"}Identifier</Text>
        <Text style={styles.subtitle}>
          Scan any wristwatch to identify the brand, model, and an estimated market range.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.push("/scan")}
          accessibilityRole="button"
          accessibilityLabel="Scan a watch"
        >
          <Text style={styles.primaryBtnText}>Scan a Watch</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  kicker: { ...typography.label, color: colors.goldMuted },
  title: { ...typography.display, color: colors.textPrimary, lineHeight: 40 },
  subtitle: { ...typography.body, color: colors.textSecondary },
  actions: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  primaryBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryBtnText: { ...typography.label, color: colors.textOnGold, fontSize: 16 },
});
