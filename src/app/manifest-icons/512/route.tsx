import { ImageResponse } from "next/og";
import { BrandIcon } from "../../../lib/brand/icon";

export const contentType = "image/png";

/** PWA manifest icon, purpose "any" — referenced by app/manifest.ts. */
export function GET() {
  return new ImageResponse(<BrandIcon size={512} padding={64} />, {
    width: 512,
    height: 512,
  });
}
