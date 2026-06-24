import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useScanStore } from "@/store/scanStore";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolio } from "@/hooks/usePortfolio";
import { colors, spacing, typography, radius } from "@/theme";
import { getDeviceCurrency } from "@/utils/format";

const CONDITIONS = ["New", "Unworn", "Excellent", "Very Good", "Good", "Fair", "Poor"];
const OWNERSHIP_STATUSES = ["Currently Owned", "Previously Owned", "Wishlist"];

export default function EditWatchScreen() {
  const router = useRouter();
  const { savedEntryId } = useScanStore();
  const { user } = useAuth();
  const { entries, loading, update: updatePortfolio } = usePortfolio(user?.id);
  const entry = entries.find((e) => e.id === savedEntryId);

  const [brand, setBrand] = React.useState(entry?.brand ?? "");
  const [modelFamily, setModelFamily] = React.useState(entry?.model_family ?? "");
  const [referenceNumber, setReferenceNumber] = React.useState(entry?.reference_number ?? "");
  const [collectionName, setCollectionName] = React.useState(entry?.collection_name ?? "");
  const [purchaseDate, setPurchaseDate] = React.useState(entry?.purchase_date ?? "");
  const [purchasePrice, setPurchasePrice] = React.useState(
    entry?.purchase_price != null ? String(entry.purchase_price) : ""
  );
  const [condition, setCondition] = React.useState<string | null>(entry?.condition ?? null);
  const [ownershipStatus, setOwnershipStatus] = React.useState<string | null>(
    entry?.ownership_status ?? null
  );
  const [boxAvailable, setBoxAvailable] = React.useState(entry?.box_available === 1);
  const [papersAvailable, setPapersAvailable] = React.useState(entry?.papers_available === 1);
  const [dateError, setDateError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  if (!entry) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.empty}>
          {loading ? "Loading…" : "This watch is no longer in your collection."}
        </Text>
      </SafeAreaView>
    );
  }

  const handleSave = async () => {
    const trimmedDate = purchaseDate.trim();
    if (trimmedDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      setDateError("Use YYYY-MM-DD format");
      return;
    }
    setDateError(null);

    const trimmedPrice = purchasePrice.trim();
    const parsedPrice = trimmedPrice === "" ? null : parseFloat(trimmedPrice);
    const validPrice = parsedPrice != null && !Number.isNaN(parsedPrice) ? parsedPrice : null;

    setSaving(true);
    try {
      await updatePortfolio(entry.id, {
        brand: brand.trim(),
        model_family: modelFamily.trim(),
        reference_number: referenceNumber.trim() === "" ? null : referenceNumber.trim(),
        collection_name: collectionName.trim() === "" ? null : collectionName.trim(),
        purchase_date: trimmedDate === "" ? null : trimmedDate,
        purchase_price: validPrice,
        purchase_currency: validPrice != null ? getDeviceCurrency() : null,
        condition,
        ownership_status: ownershipStatus,
        box_available: boxAvailable ? 1 : 0,
        papers_available: papersAvailable ? 1 : 0,
      });
      router.back();
    } catch (err) {
      console.error("[EditWatch] Failed to save:", err);
      Alert.alert("Error", "Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>IDENTIFICATION</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Brand</Text>
          <TextInput
            style={styles.input}
            value={brand}
            onChangeText={setBrand}
            placeholder="Brand"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={styles.label}>Model Family</Text>
          <TextInput
            style={styles.input}
            value={modelFamily}
            onChangeText={setModelFamily}
            placeholder="Model family"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={styles.label}>Reference Number</Text>
          <TextInput
            style={styles.input}
            value={referenceNumber}
            onChangeText={setReferenceNumber}
            placeholder="Reference number"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <Text style={styles.sectionTitle}>COLLECTION DETAILS</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Collection Name *</Text>
          <TextInput
            style={styles.input}
            value={collectionName}
            onChangeText={setCollectionName}
            placeholder="e.g. My Daily Wearers"
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={styles.label}>Purchase Date * (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={purchaseDate}
            onChangeText={(v) => {
              setPurchaseDate(v);
              setDateError(null);
            }}
            placeholder="2026-01-15"
            placeholderTextColor={colors.textTertiary}
          />
          {dateError && <Text style={styles.errorText}>{dateError}</Text>}

          <Text style={styles.label}>Purchase Price * ({getDeviceCurrency()})</Text>
          <TextInput
            style={styles.input}
            value={purchasePrice}
            onChangeText={setPurchasePrice}
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.sectionTitle}>CONDITION *</Text>
        <View style={styles.card}>
          {CONDITIONS.map((option) => (
            <Pressable key={option} style={styles.optionRow} onPress={() => setCondition(option)}>
              <Text style={styles.optionLabel}>{option}</Text>
              {condition === option && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>OWNERSHIP STATUS *</Text>
        <View style={styles.card}>
          {OWNERSHIP_STATUSES.map((option) => (
            <Pressable
              key={option}
              style={styles.optionRow}
              onPress={() => setOwnershipStatus(option)}
            >
              <Text style={styles.optionLabel}>{option}</Text>
              {ownershipStatus === option && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>WHAT CAME WITH IT</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.optionLabel}>Box Available *</Text>
            <Switch
              value={boxAvailable}
              onValueChange={setBoxAvailable}
              trackColor={{ false: colors.surfaceElevated, true: colors.gold }}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.optionLabel}>Papers Available *</Text>
            <Switch
              value={papersAvailable}
              onValueChange={setPapersAvailable}
              trackColor={{ false: colors.surfaceElevated, true: colors.gold }}
            />
          </View>
        </View>

        <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  empty: { ...typography.body, color: colors.textSecondary, margin: spacing.xl },
  sectionTitle: { ...typography.label, color: colors.goldMuted, fontSize: 11, letterSpacing: 1 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: { ...typography.label, color: colors.textSecondary, fontSize: 12, marginTop: spacing.sm },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  errorText: { ...typography.caption, color: colors.danger },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  optionLabel: { ...typography.body, color: colors.textPrimary },
  checkmark: { ...typography.body, color: colors.gold, fontWeight: "700" },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  saveBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  saveBtnText: { ...typography.label, color: colors.textOnGold },
});
