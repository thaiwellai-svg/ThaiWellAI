import fs from 'node:fs'
import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config'

/** Same build, served over HTTPS on the LAN so iPad Safari allows the microphone (voice summary). */
export default mergeConfig(
  base,
  defineConfig({
    preview: {
      https: { key: fs.readFileSync('.cert/key.pem'), cert: fs.readFileSync('.cert/cert.pem') },
    },
  }),
)
