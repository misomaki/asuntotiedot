import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fi.neliohinnat.app',
  appName: 'Neliöt',
  webDir: 'public',

  server: {
    // Point WebView to deployed Vercel URL
    url: 'https://neliohinnat.fi',
    cleartext: false,
  },

  ios: {
    allowsLinkPreview: false,
    scrollEnabled: false,
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#FFFBF5',
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#FFFBF5',
      androidScaleType: 'CENTER_CROP',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
