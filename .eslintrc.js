module.exports = {
  extends: "expo",
  rules: {
    "@typescript-eslint/no-redeclare": "off",
  },
  overrides: [
    {
      files: ["api/**/*.ts"],
      rules: {
        "expo/no-dynamic-env-var": "off",
      },
    },
  ],
};
