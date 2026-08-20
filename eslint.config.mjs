import nextConfig from "eslint-config-next";
import prettierConfig from "eslint-config-prettier";

const eslintConfig = [
  ...nextConfig,
  prettierConfig,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "generated/**",
      "prisma/generated/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
