// One-off renderer for the social banner and app icons.
// Usage: node assets-src/render-og.mjs  (from app/; requires playwright-core or playwright)
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(here, '..', 'public')
const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium'

const browser = await chromium.launch({ executablePath })

// Renders the page at its CSS size and scales the output bitmap via deviceScaleFactor.
async function shoot(html, width, height, out, scale = 1) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  await page.goto('file://' + path.join(here, html))
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(pub, out) })
  await page.close()
  console.log('wrote public/' + out)
}

await shoot('og.html', 1200, 630, 'og.png')
await shoot('icon.html', 512, 512, 'icon-512.png')
await shoot('icon.html', 512, 512, 'icon-192.png', 192 / 512)
await shoot('icon.html', 512, 512, 'apple-touch-icon.png', 180 / 512)
await browser.close()
