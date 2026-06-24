import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DatabaseProvider } from "@/hooks/useDatabase";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { RemoteConfigProvider } from "@/hooks/useRemoteConfig";
import { EntitlementProvider } from "@/hooks/useEntitlement";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { colors } from "@/theme";

/** Dark loading screen — shown while auth session is being resolved. */
function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <ActivityIndicator size="large" color={colors.gold} />
    </View>
  );
}

function InitialLayout() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/");
    }
  }, [session, loading, segments, router]);

  // Show dark loading screen while resolving — never show a white screen
  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.gold,
        headerTitleStyle: { color: colors.textPrimary },
        contentStyle: { backgroundColor: colors.background },
        // Ensure navigator container background is dark too
        animation: "fade",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="scan"
        options={{ headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="results"
        options={{ title: "Result", headerBackTitle: "Scan" }}
      />
      <Stack.Screen name="edit-watch" options={{ title: "Edit Details" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="subscription" options={{ title: "Upgrade" }} />
      <Stack.Screen name="legal/privacy-policy" options={{ title: "Privacy Policy" }} />
      <Stack.Screen name="legal/terms" options={{ title: "Terms of Service" }} />
      <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/signup" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <SafeAreaProvider>
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <DatabaseProvider>
              <AuthProvider>
                <RemoteConfigProvider>
                  <EntitlementProvider>
                    <StatusBar style="light" />
                    <InitialLayout />
                  </EntitlementProvider>
                </RemoteConfigProvider>
              </AuthProvider>
            </DatabaseProvider>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
