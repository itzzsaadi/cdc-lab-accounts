import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its .afm font metrics files relative to its own package
  // directory at runtime (`__dirname`) — bundling it rewrites that path and
  // breaks the lookup (ENOENT on Helvetica.afm). Opting it out of bundling
  // makes the route handler `require("pdfkit")` natively instead, so its
  // real on-disk path is preserved (FR-RPT-06/07).
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
