import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.renovopros.scalestation',
  appName: 'Scale Station',
  webDir: 'www',
  server: {
    url: 'https://renovopros.vercel.app/scale',
    cleartext: false,
    androidScheme: 'https',
  },
}

export default config
