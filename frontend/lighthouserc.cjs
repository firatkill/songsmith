module.exports = {
  ci: {
    collect: {
      startServerCommand: 'pnpm start',
      url: ['http://localhost:3000/en'],
      numberOfRuns: 1,
      settings: { formFactor: 'mobile', chromeFlags: '--no-sandbox' },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
