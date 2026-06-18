import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Dimensions } from "react-native";
import { colors } from "@/theme";

const { width: SCREEN_W } = Dimensions.get("window");
const RETICLE_SIZE = SCREEN_W * 0.72;
const CORNER_SIZE = 28;
const CORNER_WIDTH = 3;

interface Props {
  /** Pulsing animation active while processing. */
  active?: boolean;
}

export function ReticleOverlay({ active = false }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.04, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(1);
    }
  }, [active, pulse]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Dark vignette outside the reticle circle */}
      <View style={styles.vignette} />

      <Animated.View
        style={[styles.reticle, { transform: [{ scale: pulse }] }]}
      >
        {/* Gold corner brackets — four corners of the circumscribed square */}
        <Corner position="topLeft" />
        <Corner position="topRight" />
        <Corner position="bottomLeft" />
        <Corner position="bottomRight" />
      </Animated.View>
    </View>
  );
}

type CornerPosition = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

function Corner({ position }: { position: CornerPosition }) {
  const isTop = position.startsWith("top");
  const isLeft = position.endsWith("Left");
  return (
    <View
      style={[
        styles.corner,
        isTop ? styles.cornerTop : styles.cornerBottom,
        isLeft ? styles.cornerLeft : styles.cornerRight,
      ]}
    >
      <View
        style={[
          styles.cornerH,
          isTop ? { top: 0 } : { bottom: 0 },
          isLeft ? { left: 0 } : { right: 0 },
        ]}
      />
      <View
        style={[
          styles.cornerV,
          isTop ? { top: 0 } : { bottom: 0 },
          isLeft ? { left: 0 } : { right: 0 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 0,
  },
  reticle: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -(RETICLE_SIZE / 2),
    width: RETICLE_SIZE,
    height: RETICLE_SIZE,
    borderRadius: RETICLE_SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.gold,
    // Punch a hole through the vignette by matching the background — RN can't
    // clip children in a circular mask. We approximate with a transparent bg.
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTop: { top: 0 },
  cornerBottom: { bottom: 0 },
  cornerLeft: { left: 0 },
  cornerRight: { right: 0 },
  cornerH: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_WIDTH,
    backgroundColor: colors.goldBright,
  },
  cornerV: {
    position: "absolute",
    width: CORNER_WIDTH,
    height: CORNER_SIZE,
    backgroundColor: colors.goldBright,
  },
});
