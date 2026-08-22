import { ImageResponse } from "next/og";
import { BrandIcon } from "../../../lib/brand/icon";

export const contentType = "image/png";

/**
 * PWA manifest icon, purpose "maskable" — referenced by app/manifest.ts.
 * Extra padding (safe zone) so the glyph survives Android's adaptive-icon
 * cropping to a circle/squircle. `rounded={false}` because the OS itself
 * applies the mask shape; a maskable source image must fill its full
 * square canvas with the background color, not a pre-rounded corner.
 */
export function GET() {
  return new ImageResponse(<BrandIcon size={512} padding={128} rounded={false} />, {
    width: 512,
    height: 512,
  });
}
