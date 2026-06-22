import React from "react";
import { ScrollView, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "@/theme";

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>What we collect</Text>
        <Text style={styles.body}>
          When you create an account, we store your email address via
          Supabase Authentication. When you scan a watch, we store the
          identified brand, model, reference number, estimated value, and
          confidence score in your portfolio — both locally on your device
          and, if you are signed in, synced to our cloud database so your
          collection follows you across devices.
        </Text>

        <Text style={styles.heading}>What we never store</Text>
        <Text style={styles.body}>
          Photos you capture or upload are processed to generate an
          identification result and are not retained on our servers or by
          our AI identification provider afterward. The photo file itself
          stays only on your device — it is never included in the cloud
          sync of your portfolio.
        </Text>

        <Text style={styles.heading}>Third parties</Text>
        <Text style={styles.body}>
          To identify a watch, the photo is sent securely to our AI
          identification provider solely to generate a result. To estimate
          market value, the identified brand/model (text only — never the
          photo) is sent to eBay's public listings API. Neither receives
          your email or account information.
        </Text>

        <Text style={styles.heading}>Your data, your control</Text>
        <Text style={styles.body}>
          You can delete your account at any time from Settings. This
          permanently removes your account and your cloud-synced portfolio
          data. Data stored locally on your device is removed from the
          device at the same time.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  heading: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.md },
  body: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
});
