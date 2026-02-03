
import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
    { files: ["src/**/*.{js,mjs,cjs,ts}", "tests/**/*.{js,mjs,cjs,ts}"] },
    { languageOptions: { globals: globals.node } },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/ban-ts-comment": "off",
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "prefer-const": "warn",
            "@typescript-eslint/no-inferrable-types": "off",
            "@typescript-eslint/no-var-requires": "off",
            "no-useless-escape": "off",
            "no-case-declarations": "off",
            "no-empty": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "no-prototype-builtins": "off",
            "no-control-regex": "off"
        }
    },
    {
        ignores: ["dist/", "node_modules/", "coverage/", "**/*.d.ts"]
    }
];
