/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-max-line-length": [0],
    "scope-case": [2, "always", "lower-case"],
    "scope-empty": [2, "never"],
  },
};
