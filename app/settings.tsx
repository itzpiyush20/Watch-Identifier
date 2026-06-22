import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useCountryCode } from "@/hooks/useCountryCode";
import { useAuth } from "@/hooks/useAuth";
import { useDatabase } from "@/hooks/useDatabase";
import { REGIONS } from "@/constants";
import { colors, spacing, typography, radius } from "@/theme";

const apiBaseUrl: string = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? "";

export default function SettingsScreen() {
  const router = useRouter();
  const { countryCode, setCountryCode } = useCountryCode();
  const { session, signOut } = useAuth();
  const { db } = useDatabase();
  const [deleting, setDeleting] = useState(false);
  const version = Constants.expoConfig?.version ?? "—";

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your account and synced portfolio data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!session?.access_token) return;
            setDeleting(true);
            try {
              const resp = await fetch(`${apiBaseUrl}/api/account`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
              if (!resp.ok) {
                Alert.alert("Error", "Failed to delete account. Please try again.");
                setDeleting(false);
                return;
              }
              if (db) {
                await db.runAsync("DELETE FROM local_portfolio;");
              }
              await signOut();
              router.replace("/(auth)/login");
            } catch (err) {
              console.error("[Settings] Account deletion failed:", err);
              Alert.alert("Error", "Failed to delete account. Please try again.");
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>REGION & CURRENCY</Text>
        <View style={styles.card}>
          {REGIONS.map((region) => (
            <Pressable
              key={region.code}
              style={styles.regionRow}
              onPress={() => void setCountryCode(region.code)}
            >
              <Text style={styles.regionLabel}>
                {region.currencySymbol} {region.label}
              </Text>
              {countryCode === region.code && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>ABOUT</Text>
        <View style={styles.card}>
          <Pressable style={styles.row} onPress={() => router.push("/legal/privacy-policy")}>
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <Text style={styles.rowChevron}>›</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => router.push("/legal/terms")}>
            <Text style={styles.rowLabel}>Terms of Service</Text>
            <Text style={styles.rowChevron}>›</Text>
          </Pressable>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.versionText}>{version}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <Pressable
          style={[styles.dangerCard, deleting && styles.disabled]}
          onPress={handleDeleteAccount}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.dangerText}>Delete My Account</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  sectionTitle: { ...typography.label, color: colors.goldMuted, fontSize: 11, letterSpacing: 1 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  regionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  regionLabel: { ...typography.body, color: colors.textPrimary },
  checkmark: { ...typography.body, color: colors.gold, fontWeight: "700" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  rowLabel: { ...typography.body, color: colors.textPrimary },
  rowChevron: { ...typography.body, color: colors.textTertiary, fontSize: 18 },
  versionText: { ...typography.caption, color: colors.textTertiary },
  dangerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  dangerText: { ...typography.label, color: colors.danger },
  disabled: { opacity: 0.6 },
});
