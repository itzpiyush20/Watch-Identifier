import { View } from "react-native";

/** Never actually rendered — the Scan tab intercepts tabPress and pushes
 *  /scan instead (see app/(tabs)/_layout.tsx). This file only exists so
 *  expo-router has a route to register the tab against. */
export default function ScanTabPlaceholder() {
  return <View />;
}
