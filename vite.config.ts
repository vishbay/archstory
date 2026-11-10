import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * A Content Security Policy for the built site (GitHub Pages cannot send headers, so it goes in a meta tag).
 * Only ArchStory's own scripts may run, which is the main protection for an API key kept in the page.
 * Network calls may go to the AI providers, to any https server (a custom OpenAI-compatible endpoint) and to a local
 * model server. Not applied in development, where Vite needs an inline script for hot reload.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",            // the canvas positions nodes with inline styles
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

const securityPolicy = (): Plugin => ({
  name: 'archstory-csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
})

/** Print a friendlier local address: any *.localhost name reaches this machine in Chrome, Edge and Firefox. */
const friendlyUrl = (): Plugin => ({
  name: 'archstory-url',
  apply: 'serve',
  configureServer(server) {
    const print = server.printUrls
    server.printUrls = () => {
      print()
      const local = server.resolvedUrls?.local[0]
      if (local) console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mArchStory\x1b[0m: ${local.replace('//localhost', '//archstory.localhost')}`)
    }
  },
})

// BASE_PATH is set by the GitHub Pages workflow, where the site lives under /<repo>/.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), securityPolicy(), friendlyUrl()],
})
