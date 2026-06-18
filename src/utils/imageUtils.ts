import * as ImageManipulator from "expo-image-manipulator";
import { IMAGE } from "@/constants";

export interface ProcessedImage {
  base64: string;
  uri: string;
  width: number;
  height: number;
  estimatedBytes: number;
}

/** Calculates the resize action that constrains the longest edge to MAX_LONGEST_EDGE
 *  while preserving aspect ratio. Returns undefined when the image is already small enough. */
function resizeAction(
  width: number,
  height: number
): ImageManipulator.Action | undefined {
  const longest = Math.max(width, height);
  if (longest <= IMAGE.MAX_LONGEST_EDGE) return undefined;
  const scale = IMAGE.MAX_LONGEST_EDGE / longest;
  return {
    resize:
      width >= height
        ? { width: Math.round(width * scale) }
        : { height: Math.round(height * scale) },
  };
}

function approximateBase64Bytes(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * Resizes to ≤800px longest edge, compresses to JPEG, returns base64.
 * If the first pass still exceeds the 2 MB hard cap (unlikely but possible with
 * extreme source images), retries at a lower quality before throwing.
 */
export async function processImageForUpload(
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number
): Promise<ProcessedImage> {
  const actions: ImageManipulator.Action[] = [];
  const resize = resizeAction(sourceWidth, sourceHeight);
  if (resize) actions.push(resize);

  const result = await ImageManipulator.manipulateAsync(sourceUri, actions, {
    compress: IMAGE.COMPRESS_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  const base64 = result.base64 ?? "";
  const bytes = approximateBase64Bytes(base64);

  if (bytes > IMAGE.MAX_UPLOAD_BYTES) {
    // One retry at lower quality before giving up.
    const retry = await ImageManipulator.manipulateAsync(sourceUri, actions, {
      compress: 0.5,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    const retryBase64 = retry.base64 ?? "";
    const retryBytes = approximateBase64Bytes(retryBase64);
    if (retryBytes > IMAGE.MAX_UPLOAD_BYTES) {
      throw new Error("Image is too large to upload even after compression.");
    }
    return {
      base64: retryBase64,
      uri: retry.uri,
      width: retry.width,
      height: retry.height,
      estimatedBytes: retryBytes,
    };
  }

  return {
    base64,
    uri: result.uri,
    width: result.width,
    height: result.height,
    estimatedBytes: bytes,
  };
}
