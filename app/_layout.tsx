import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DatabaseProvider } from "@/hooks/useDatabase";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <DatabaseProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.gold,
            headerTitleStyle: { color: colors.textPrimary },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: "The Watch Identifier" }} />
          <Stack.Screen
            name="scan"
            options={{ headerShown: false, animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="results"
            options={{ title: "Result", headerBackTitle: "Scan" }}
          />
        </Stack>
        </DatabaseProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
