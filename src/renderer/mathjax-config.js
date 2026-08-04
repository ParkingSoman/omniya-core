// Keep MathJax completely local. The bundle contains the explorer and speech
// components; this configuration only enables them and stops automatic page
// typesetting so the app can render each saved equation deliberately.
globalThis.MathJax = {
  loader: {
    load: ['a11y/assistive-mml'],
    // These aliases point at packages installed with the app. In particular,
    // this prevents the bundled CHTML/SRE components from falling back to
    // their public CDN defaults.
    paths: {
      mathjax: '../../node_modules/@mathjax/src/bundle',
      fonts: '../../node_modules/@mathjax',
      sre: '../../node_modules/@mathjax/src/bundle/sre',
      mathmaps: '../../node_modules/@mathjax/src/bundle/sre/mathmaps'
    }
  },
  startup: { typeset: false },
  options: {
    enableEnrichment: true,
    enableSpeech: true,
    enableBraille: true,
    enableAssistiveMml: true,
    a11y: { inTabOrder: true, roleDescription: 'math' },
    sre: { locale: 'en', domain: 'clearspeak', style: 'default' }
  }
};
