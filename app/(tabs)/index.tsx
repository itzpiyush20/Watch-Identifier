import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  Dimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { colors, spacing, typography, radius } from "@/theme";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useScanStore } from "@/store/scanStore";
import { formatCurrency } from "@/utils/format";
import { getDeviceCurrency } from "@/utils/format";
import type { PortfolioEntry, IdentifyResponse, Identification, MarketRange } from "@/types";
import { CollectionShareCard } from "@/components/share/CollectionShareCard";
import { WatchShareCard } from "@/components/share/WatchShareCard";
import { captureAndShare } from "@/services/share";
import { supabase } from "@/services/supabase";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - spacing.lg * 2 - spacing.md) / 2;

interface WatchCardProps {
  item: PortfolioEntry;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
}

function WatchCard({ item, index, onPress, onLongPress }: WatchCardProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  let medianPrice = "—";
  try {
    const market = JSON.parse(item.market_data_json);
    if (market.median_estimate) {
      medianPrice = formatCurrency(market.median_estimate, market.currency);
    }
  } catch {}

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(300)}>
      <Animated.View style={animatedStyle}>
        <Pressable
          style={styles.card}
          onPress={() => {
            void Haptics.selectionAsync();
            onPress();
          }}
          onLongPress={onLongPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <View style={styles.imageContainer}>
            {item.image_uri ? (
              <Image source={{ uri: item.image_uri }} style={styles.cardImage} />
            ) : (
              <View style={styles.placeholderImage}>
                <Ionicons name="watch-outline" size={40} color={colors.goldMuted} />
              </View>
            )}
            <View style={styles.syncBadge}>
              <Ionicons
                name={item.synced === 1 ? "cloud-done-outline" : "sync-outline"}
                size={14}
                color={colors.textPrimary}
              />
            </View>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardBrand} numberOfLines={1}>
              {item.brand}
            </Text>
            <Text style={styles.cardModel} numberOfLines={1}>
              {item.model_family}
            </Text>
            <Text style={styles.cardPrice}>{medianPrice}</Text>
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { entries: allEntries, loading, remove: removeEntry, refresh } = usePortfolio(user?.id);
  const { entitlement } = useEntitlement();
  const { setResult } = useScanStore();

  const RETENTION_DAYS = 90;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const unlimitedHistory = entitlement?.unlimited_history ?? true; // default open until entitlement loads
  const entries = unlimitedHistory ? allEntries : allEntries.filter((e) => e.scanned_at >= cutoff);
  const hiddenCount = allEntries.length - entries.length;

  const handleCardPress = (entry: PortfolioEntry) => {
    try {
      const market = JSON.parse(entry.market_data_json);
      const authenticity = JSON.parse(entry.authenticity_caution);

      const response: IdentifyResponse = {
        identification: {
          brand: entry.brand,
          model_family: entry.model_family,
          reference_number: entry.reference_number,
          search_string: `${entry.brand} ${entry.model_family}`,
          search_queries: [`${entry.brand} ${entry.model_family}`],
          confidence_score: entry.confidence_score,
          possible_matches: [],
          authenticity_caution: authenticity,
          verification_required:
            entry.confidence_score < 0.85 || entry.reference_number != null,
          additional_image_hint: null,
          visual_fingerprint: null,
          visual_fingerprint_confidence: 0,
        },
        market: market,
        cached: true,
        request_id: entry.id,
      };

      setResult(response, entry.image_uri, entry.id);
      router.push("/results");
    } catch (e) {
      console.error("[HomeScreen] Failed to parse portfolio entry:", e);
    }
  };

  const [shareTarget, setShareTarget] = React.useState<{
    entry: PortfolioEntry;
    identification: Identification;
    market: MarketRange;
  } | null>(null);
  const cardShareRef = React.useRef<View>(null);
  const shareTargetIdRef = React.useRef<string | null>(null);

  const handleDeleteEntry = (entry: PortfolioEntry) => {
    Alert.alert(
      "Delete from Collection",
      `Remove ${entry.brand} ${entry.model_family} from your collection? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await removeEntry(entry.id);
              if (entry.synced === 1) {
                try {
                  await supabase.from("portfolio").delete().eq("id", entry.id);
                } catch (err) {
                  console.error("[HomeScreen] Best-effort remote delete failed:", err);
                }
              }
            } catch (err) {
              console.error("[HomeScreen] Failed to delete entry:", err);
              Alert.alert("Error", "Failed to delete. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleCardLongPress = (entry: PortfolioEntry) => {
    Alert.alert(entry.brand, entry.model_family, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Share",
        onPress: () => {
          try {
            const identification: Identification = {
              brand: entry.brand,
              model_family: entry.model_family,
              reference_number: entry.reference_number,
              search_string: `${entry.brand} ${entry.model_family}`,
              search_queries: [`${entry.brand} ${entry.model_family}`],
              confidence_score: entry.confidence_score,
              possible_matches: [],
              authenticity_caution: JSON.parse(entry.authenticity_caution),
              verification_required: false,
              additional_image_hint: null,
              visual_fingerprint: null,
              visual_fingerprint_confidence: 0,
            };
            const market: MarketRange = JSON.parse(entry.market_data_json);
            shareTargetIdRef.current = entry.id;
            setShareTarget({ entry, identification, market });
          } catch (err) {
            console.error("[HomeScreen] Failed to parse entry for sharing:", err);
            Alert.alert("Error", "Failed to prepare this watch for sharing.");
          }
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => handleDeleteEntry(entry),
      },
    ]);
  };

  React.useEffect(() => {
    if (!shareTarget) return;
    const targetId = shareTarget.entry.id;
    const run = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50)); // let the off-screen card render with the new target
      if (shareTargetIdRef.current !== targetId) return; // a newer long-press superseded this one
      await captureAndShare(
        cardShareRef,
        `${shareTarget.entry.brand}-${shareTarget.entry.model_family}`
      );
      if (shareTargetIdRef.current === targetId) {
        shareTargetIdRef.current = null;
        setShareTarget(null);
      }
    };
    void run();
  }, [shareTarget]);

  const getCollectionValue = () => {
    return entries.reduce((sum, entry) => {
      try {
        const market = JSON.parse(entry.market_data_json);
        return sum + (market.median_estimate ?? 0);
      } catch {
        return sum;
      }
    }, 0);
  };

  const collectionShareRef = React.useRef<View>(null);

  const handleShareCollection = async () => {
    await captureAndShare(collectionShareRef, "my-watch-collection");
  };

  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const renderItem = ({ item, index }: { item: PortfolioEntry; index: number }) => (
    <WatchCard
      item={item}
      index={index}
      onPress={() => handleCardPress(item)}
      onLongPress={() => handleCardLongPress(item)}
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.gold} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerKicker}>OFFLINE-FIRST COLLECTION</Text>
          <Text style={styles.headerTitle}>Horology Vault</Text>
        </View>
      </View>

      {/* Collection Stats Card */}
      {entries.length > 0 && (
        <LinearGradient
          colors={["rgba(201,162,75,0.12)", "rgba(20,20,22,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statsCard}
        >
          <View style={styles.statsRow}>
            <View>
              <View style={styles.statsLabelRow}>
                <Ionicons name="diamond-outline" size={12} color={colors.goldMuted} />
                <Text style={styles.statsLabel}>COLLECTION VALUE</Text>
              </View>
              <Text style={styles.statsValue}>
                {formatCurrency(getCollectionValue(), getDeviceCurrency())}
              </Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsItem}>
              <Text style={styles.statsLabel}>TIMEPIECES</Text>
              <Text style={styles.statsValue}>{entries.length}</Text>
            </View>
          </View>
          <Pressable style={styles.shareCollectionBtn} onPress={handleShareCollection}>
            <Text style={styles.shareCollectionBtnText}>Share Collection</Text>
          </Pressable>
        </LinearGradient>
      )}

      {hiddenCount > 0 && (
        <Text style={styles.retentionNote}>
          {hiddenCount} older scan{hiddenCount === 1 ? "" : "s"} hidden — upgrade to
          Connoisseur or Vault to see your full history.
        </Text>
      )}

      {/* Watch Grid or Empty State */}
      {entries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="watch-outline" size={64} color={colors.goldMuted} />
          <Text style={styles.emptyTitle}>Vault is Empty</Text>
          <Text style={styles.emptySubtitle}>
            Scan a wristwatch to automatically identify it, estimate its market value,
            and add it to your digital vault.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push("/scan")}>
            <Text style={styles.primaryBtnText}>Scan a Watch</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={entries}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating Action Button */}
      {entries.length > 0 && (
        <Pressable style={styles.fab} onPress={() => router.push("/scan")}>
          <Text style={styles.fabText}>+ Scan</Text>
        </Pressable>
      )}

      <View style={styles.offscreen} pointerEvents="none">
        <CollectionShareCard
          ref={collectionShareRef}
          entries={entries}
          totalValue={getCollectionValue()}
          currency={getDeviceCurrency()}
        />
      </View>

      {shareTarget && (
        <View style={styles.offscreen} pointerEvents="none">
          <WatchShareCard
            ref={cardShareRef}
            identification={shareTarget.identification}
            market={shareTarget.market}
            imageUri={shareTarget.entry.image_uri}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerKicker: { ...typography.label, color: colors.goldMuted, fontSize: 10 },
  headerTitle: { ...typography.title, color: colors.textPrimary },
  retentionNote: {
    ...typography.caption,
    color: colors.textTertiary,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statsDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  statsItem: {
    alignItems: "flex-end",
  },
  statsLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statsLabel: { ...typography.label, color: colors.textTertiary, fontSize: 10 },
  statsValue: { fontFamily: "BodoniModa_700Bold", color: colors.gold, fontSize: 20 },
  shareCollectionBtn: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: "center",
  },
  shareCollectionBtnText: { ...typography.label, color: colors.gold, fontSize: 13 },
  offscreen: {
    position: "absolute",
    top: -9999,
    left: -9999,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 90,
  },
  columnWrapper: {
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  imageContainer: {
    height: 190,
    backgroundColor: colors.surfaceElevated,
    position: "relative",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  placeholderImage: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  syncBadge: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
    padding: 4,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  cardInfo: {
    padding: spacing.sm,
    gap: 2,
  },
  cardBrand: { ...typography.label, color: colors.gold, fontSize: 12 },
  cardModel: { ...typography.body, color: colors.textPrimary, fontSize: 14 },
  cardPrice: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { ...typography.title, color: colors.textPrimary },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  primaryBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    marginTop: spacing.md,
  },
  primaryBtnText: { ...typography.label, color: colors.textOnGold, fontSize: 16 },
  fab: {
    position: "absolute",
    bottom: spacing.lg,
    alignSelf: "center",
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabText: { ...typography.label, color: colors.textOnGold, fontSize: 16 },
});
