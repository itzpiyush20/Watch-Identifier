import { View, Text, ScrollView, StyleSheet, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useScanStore } from "@/store/scanStore";
import { colors, spacing, typography, radius } from "@/theme";

/**
 * Phase 4 placeholder — renders the raw JSON result so the end-to-end pipeline
 * can be validated before the full results UI lands in Phase 6.
 */
export default function ResultsScreen() {
  const router = useRouter();
  const { result, clear } = useScanStore();

  if (!result) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.empty}>No scan result. Go back and scan a watch.</Text>
      </SafeAreaView>
    );
  }

  const { identification, market } = result;

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.kicker}>IDENTIFICATION</Text>
        <Text style={styles.brand}>{identification.brand}</Text>
        <Text style={styles.model}>{identification.model_family}</Text>

        {identification.reference_number && (
          <Text style={styles.ref}>Ref. {identification.reference_number}</Text>
        )}

        <View style={styles.row}>
          <Text style={styles.label}>Confidence</Text>
          <Text style={styles.value}>
            {Math.round(identification.confidence_score * 100)}%
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Market estimate</Text>
          <Text style={styles.value}>
            {market.median_estimate != null
              ? `${market.currency} ${market.median_estimate.toLocaleString("en-IN")}`
              : "—"}
          </Text>
        </View>

        <Text style={styles.disclaimer}>{market.disclaimer}</Text>

        <Text style={styles.devNote}>
          Full results UI coming in Phase 6.{"\n"}Raw payload:
        </Text>
        <Text style={styles.json}>{JSON.stringify(result, null, 2)}</Text>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          style={styles.btn}
          onPress={() => {
            clear();
            router.back();
          }}
        >
          <Text style={styles.btnText}>Scan Another</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  empty: { ...typography.body, color: colors.textSecondary, margin: spacing.xl },

  kicker: { ...typography.label, color: colors.goldMuted },
  brand: { ...typography.display, color: colors.textPrimary },
  model: { ...typography.title, color: colors.textSecondary },
  ref: { ...typography.label, color: colors.textTertiary },

  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { ...typography.label, color: colors.textSecondary },
  value: { ...typography.heading, color: colors.gold },

  disclaimer: { ...typography.caption, color: colors.textTertiary, fontStyle: "italic" },

  devNote: { ...typography.caption, color: colors.goldMuted, marginTop: spacing.lg },
  json: {
    ...typography.caption,
    color: colors.textTertiary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },

  actions: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  btn: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  btnText: { ...typography.label, color: colors.textOnGold },
});
