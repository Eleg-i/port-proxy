module.exports = [
  {
    files: [
      'vite.config.ts',
      'vite.*.config.ts',
      'pages.config.ts',
      'manifest.config.ts',
      '.lintstagedrc.*'
    ],
    rules: {
      'jsdoc/require-jsdoc': 0 // vite 配置允许省略方法注释
    }
  },
  {
    files: ['*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 0, // cjs 允许使用 require
      '@typescript-eslint/no-var-requires': 0 // cjs 允许使用 require'
    }
  },
  {
    files: ['*.ts', '*.vue'],
    rules: {
      'jsdoc/require-returns': 0 // ts 允许函数不带 return
    }
  }
]
