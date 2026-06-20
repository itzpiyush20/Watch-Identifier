import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary — catches any render-time JS crash and shows a
 * readable message instead of a blank/black screen.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>⚠️ App Error</Text>
          <Text style={styles.subtitle}>
            Something went wrong. Please restart the app.
          </Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.errorText}>
              {this.state.error?.message ?? "Unknown error"}
            </Text>
            <Text style={styles.stackText}>
              {this.state.error?.stack ?? ""}
            </Text>
          </ScrollView>
          <Pressable
            style={styles.btn}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.btnText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0B0C",
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#C9A24B",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#A9A9A6",
    marginBottom: 16,
  },
  scroll: {
    maxHeight: 300,
    backgroundColor: "#141416",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    color: "#D2645A",
    fontWeight: "600",
    marginBottom: 8,
  },
  stackText: {
    fontSize: 11,
    color: "#6E6E6B",
    fontFamily: "monospace",
  },
  btn: {
    backgroundColor: "#C9A24B",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: {
    color: "#0B0B0C",
    fontWeight: "700",
    fontSize: 16,
  },
});
