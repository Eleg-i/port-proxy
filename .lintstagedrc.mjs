export default {
  '*.{ts,tsx,vue}': () => 'npm run type-check',
  '*.{ts,tsx,js,jsx,vue,cjs,mjs}': ['prettier -w --cache', 'eslint --fix --cache --max-warnings=0'],
  '*.{css,scss,less,vue}': ['stylelint --fix --cache', 'prettier -w --cache']
}
