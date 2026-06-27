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
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useScanStore } from "@/store/scanStore";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolio } from "@/hooks/usePortfolio";
import { colors, spacing, typography, radius } from "@/theme";
import { getDeviceCurrency } from "@/utils/format";

const CONDITIONS = ["New", "Unworn", "Excellent", "Very Good", "Good", "Fair", "Poor"];
const OWNERSHIP_STATUSES = ["Currently Owned", "Previously Owned", "Wishlist"];
const BEST_FOR_OPTIONS = ["Formal", "Party", "Sport / Active", "Everyday / Casual", "Dress", "Travel"];

export default function EditWatchScreen() {
  const router = useRouter();
  const { savedEntryId, result, setResult, imageUri } = useScanStore();
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
  const [bestFor, setBestFor] = React.useState<string | null>(entry?.best_for ?? null);
  const [receiptImageUri, setReceiptImageUri] = React.useState<string | null>(entry?.receipt_image_uri ?? null);
  const [certificateImageUri, setCertificateImageUri] = React.useState<string | null>(entry?.certificate_image_uri ?? null);
  const [dateError, setDateError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
 
  React.useEffect(() => {
    if (!entry) return;
    setBrand(entry.brand);
    setModelFamily(entry.model_family);
    setReferenceNumber(entry.reference_number ?? "");
    setCollectionName(entry.collection_name ?? "");
    setPurchaseDate(entry.purchase_date ?? "");
    setPurchasePrice(entry.purchase_price != null ? String(entry.purchase_price) : "");
    setCondition(entry.condition ?? null);
    setOwnershipStatus(entry.ownership_status ?? null);
    setBoxAvailable(entry.box_available === 1);
    setPapersAvailable(entry.papers_available === 1);
    setBestFor(entry.best_for ?? null);
    setReceiptImageUri(entry.receipt_image_uri ?? null);
    setCertificateImageUri(entry.certificate_image_uri ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const handlePickImage = async (type: "receipt" | "certificate") => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Grant photo library access to upload documents.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const uri = picked.assets[0].uri;
    if (type === "receipt") {
      setReceiptImageUri(uri);
    } else {
      setCertificateImageUri(uri);
    }
  };

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
      let updatedMarketDataJson = entry.market_data_json;
      if (validPrice != null) {
        try {
          const market = JSON.parse(entry.market_data_json);
          market.median_estimate = validPrice;
          market.low_estimate = validPrice;
          market.high_estimate = validPrice;
          updatedMarketDataJson = JSON.stringify(market);
        } catch (e) {
          console.error("Failed to update market_data_json with edited price:", e);
        }
      }

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
        best_for: bestFor,
        market_data_json: updatedMarketDataJson,
        receipt_image_uri: receiptImageUri,
        certificate_image_uri: certificateImageUri,
      });

      // Update the scan store result so that ResultsScreen refreshes instantly
      if (result) {
        setResult(
          {
            ...result,
            identification: {
              ...result.identification,
              brand: brand.trim(),
              model_family: modelFamily.trim(),
              reference_number: referenceNumber.trim() === "" ? null : referenceNumber.trim(),
            },
            market: {
              ...result.market,
              median_estimate: validPrice != null ? validPrice : result.market.median_estimate,
              low_estimate: validPrice != null ? validPrice : result.market.low_estimate,
              high_estimate: validPrice != null ? validPrice : result.market.high_estimate,
            },
          },
          imageUri,
          entry.id
        );
      }

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

        <Text style={styles.sectionTitle}>BEST FOR</Text>
        <View style={styles.card}>
          {BEST_FOR_OPTIONS.map((option) => (
            <Pressable key={option} style={styles.optionRow} onPress={() => setBestFor(option)}>
              <Text style={styles.optionLabel}>{option}</Text>
              {bestFor === option && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>DOCUMENTATION VAULT</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Purchase Receipt</Text>
          {receiptImageUri ? (
            <View style={styles.documentContainer}>
              <Image source={{ uri: receiptImageUri }} style={styles.documentThumbnail} />
              <View style={styles.documentInfo}>
                <Text style={styles.documentName} numberOfLines={1}>Receipt Image</Text>
                <Pressable onPress={() => setReceiptImageUri(null)} style={styles.documentDeleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Text style={styles.documentDeleteText}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              style={styles.addDocumentBtn}
              onPress={() => handlePickImage("receipt")}
            >
              <Ionicons name="receipt-outline" size={20} color={colors.gold} />
              <Text style={styles.addDocumentBtnText}>Add Receipt Photo</Text>
            </Pressable>
          )}

          <Text style={[styles.label, { marginTop: spacing.md }]}>Certificate / Warranty Card</Text>
          {certificateImageUri ? (
            <View style={styles.documentContainer}>
              <Image source={{ uri: certificateImageUri }} style={styles.documentThumbnail} />
              <View style={styles.documentInfo}>
                <Text style={styles.documentName} numberOfLines={1}>Certificate / Warranty</Text>
                <Pressable onPress={() => setCertificateImageUri(null)} style={styles.documentDeleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Text style={styles.documentDeleteText}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              style={styles.addDocumentBtn}
              onPress={() => handlePickImage("certificate")}
            >
              <Ionicons name="ribbon-outline" size={20} color={colors.gold} />
              <Text style={styles.addDocumentBtnText}>Add Certificate Photo</Text>
            </Pressable>
          )}
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

  // ------------ Documentation Vault styles -----------------------------------
  addDocumentBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  addDocumentBtnText: {
    ...typography.label,
    color: colors.gold,
    fontSize: 13,
  },
  documentContainer: {
    flexDirection: "row",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.sm,
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  documentThumbnail: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    resizeMode: "cover",
  },
  documentInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  documentName: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 14,
  },
  documentDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  documentDeleteText: {
    ...typography.caption,
    color: colors.danger,
    fontSize: 12,
  },
});
