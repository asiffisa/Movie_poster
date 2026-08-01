const js = require("@eslint/js");
const figmaPlugin = require("@figma/eslint-plugin-figma-plugins");
const typescriptParser = require("@typescript-eslint/parser");
const typescriptPlugin = require("@typescript-eslint/eslint-plugin");

const typescriptRules = {
  ...typescriptPlugin.configs.recommended.rules,
  ...figmaPlugin.configs.recommended.rules,
  "no-undef": "off",
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_"
    }
  ]
};

function typescriptConfig(files, project) {
  return {
    files,
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project,
        tsconfigRootDir: __dirname
      }
    },
    plugins: {
      "@figma/figma-plugins": figmaPlugin,
      "@typescript-eslint": typescriptPlugin
    },
    rules: typescriptRules
  };
}

module.exports = [
  {
    ignores: ["node_modules/**", "code.js", "setup.js", "worker/worker-configuration.d.ts"]
  },
  js.configs.recommended,
  typescriptConfig(["code.ts"], "./tsconfig.json"),
  typescriptConfig(["worker/src/**/*.ts"], "./worker/tsconfig.json")
];
