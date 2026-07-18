import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.renovopros.guardstation',
  appName: 'Guard Station',
  webDir: 'www',
  server: {
    url: 'https://renovopros.vercel.app/gate',
    cleartext: false,
    androidScheme: 'https',
  },
}

export default config
