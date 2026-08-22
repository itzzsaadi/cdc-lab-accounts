import { ImageResponse } from "next/og";
import { BrandIcon } from "../../../lib/brand/icon";

export const contentType = "image/png";

/** PWA manifest icon, purpose "any" — referenced by app/manifest.ts. */
export function GET() {
  return new ImageResponse(<BrandIcon size={192} padding={24} />, {
    width: 192,
    height: 192,
  });
}
