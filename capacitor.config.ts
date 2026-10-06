import type { CapacitorConfig } from '@capacitor/cli'

/** Native iPad app: wraps the production build (dist/) in a WKWebView. */
const config: CapacitorConfig = {
  appId: 'ai.thaiwell.backoffice',
  appName: 'ThaiWell',
  webDir: 'dist',
  backgroundColor: '#1d2a22',
  ios: {
    contentInset: 'never',
    // the web app handles its own safe areas and scrolling
    scrollEnabled: false,
    limitsNavigationsToAppBoundDomains: false,
  },
}

export default config
