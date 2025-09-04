module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: { node: '16' },
        corejs: '3',
        useBuiltIns: 'usage',
        spec: true
      }
    ]
  ],
  plugins: [
    // '@babel/plugin-proposal-optional-chaining',
    // '@babel/plugin-proposal-nullish-coalescing-operator',
    // '@babel/plugin-proposal-class-static-block',
    '@babel/plugin-transform-class-properties',
    '@babel/plugin-transform-private-methods'
  ],
  env: {
    dev: {
      plugins: [['transform-remove-console', { include: [''] }]]
    },
    build: {
      plugins: [['transform-remove-console', { exclude: ['error', 'warn'] }]]
    }
  }
}
