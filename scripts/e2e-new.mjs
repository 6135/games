/**
 * End to end smoke test for Pontos e Quadrados and Batalha Naval. Runs a local
 * broker, serves the build, plays pontos alone against a bot, and a naval round
 * with two people and a bot.
 *
 * Run: npm run build && node scripts/e2e-smoke.mjs
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { Aedes } from 'aedes'
import { WebSocketServer, createWebSocketStream } from 'ws'
import { chromium } from 'playwright'

const BROKER_PORT = 1884
const APP_PORT = 4173
const APP_URL = `http://127.0.0.1:${APP_PORT}/games/`
const BROKER_URL = `ws://127.0.0.1:${BROKER_PORT}`
const ROOM = 'sala de teste'
const KEY = 'chave-secreta'
const broker = await Aedes.createBroker()
const http = createServer()
new WebSocketServer({
  server: http,
  handleProtocols: (protocols) => (protocols.has('mqtt') ? 'mqtt' : false),
}).on('connection', (socket) => broker.handle(createWebSocketStream(socket)))
await new Promise((resolve) => http.listen(BROKER_PORT, resolve))

const preview = spawn('npx', ['vite', 'preview', '--port', String(APP_PORT), '--strictPort'], {
  // A pipe held open by the child would block the caller after this exits.
  stdio: 'ignore',
  // Its own process group, so one kill stops npx and the vite server it starts.
  detached: true,
})
function stopPreview() {
  try {
    process.kill(-preview.pid, 'SIGKILL')
  } catch {
    /* already gone */
  }
}
process.on('exit', () => stopPreview())
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopPreview()
    process.exit(1)
  })
}
await waitForApp()

// The sandbox ships one Chromium build. Use it instead of a download.
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
})
const failures = []
try {
  // Pontos e Quadrados: one person against a bot.
  const dora = await newPage(browser, 'dora')
  await enter(dora, 'dora', 'Criar sala', /^Pontos/, 'sala pontos')
  await dora.getByRole('button', { name: 'Adicionar bot' }).click()
  await dora.getByRole('button', { name: 'Começar o jogo' }).click()
  await dora.locator('.dots').waitFor({ timeout: 15000 })
  check('two players get a 4x4 box board', (await dora.locator('.box').count()) === 16)
  await playUntil([dora], '.dots .edge:not([disabled])', dora, /ganhou\.|Empate\./)
  check('every line was drawn, the bot included', (await dora.locator('.edge--drawn').count()) === 40)
  await dora.getByRole('button', { name: /Histórico \(1\)/ }).waitFor({ timeout: 10000 })
  check('the pontos round reached the history', true)
  await dora.getByRole('button', { name: 'Fechar a sala' }).click()

  // Batalha Naval: two people and a bot.
  const ana = await newPage(browser, 'ana')
  const bruno = await newPage(browser, 'bruno')
  await enter(ana, 'ana', 'Criar sala', /^Batalha Naval/, 'sala naval')
  await enter(bruno, 'bruno', 'Entrar', /^Batalha Naval/, 'sala naval')
  await ana.getByText('bruno').first().waitFor({ timeout: 15000 })
  await ana.getByRole('button', { name: 'Adicionar bot' }).click()
  await ana.getByRole('button', { name: 'Começar o jogo' }).click()
  for (const page of [ana, bruno]) {
    await page.getByRole('button', { name: 'Pronto' }).click({ timeout: 15000 })
  }
  await bruno.locator('.naval__seas').waitFor({ timeout: 15000 })
  check('three seas on every device', (await bruno.locator('.sea').count()) === 3)
  check(
    'only the own fleet shows: the others never reach this device',
    (await bruno.locator('.sea-cell--ship').count()) === 17,
  )
  await playUntil([ana, bruno], '.sea--target .sea-cell:not([disabled])', ana, /ganhou\.|Ninguém ficou/)
  await ana.getByRole('button', { name: 'Próxima ronda' }).waitFor({ timeout: 20000 })
  const verdicts = await ana.locator('.naval__verdicts').innerText()
  check('every fleet was revealed and checked', (verdicts.match(/respostas certas/g) ?? []).length === 3)
  check('the host scored one point', (await totalScore(ana)) === 1)
  await ana.getByRole('button', { name: /Histórico/ }).click()
  check('the history says the answers were checked', await ana.getByText(/respostas verificadas/).isVisible())
} catch (error) {
  failures.push(`threw: ${error.message}`)
} finally {
  await browser.close()
  stopPreview()
  http.close()
  broker.close()
}

if (failures.length > 0) {
  console.error('\nFAILED')
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log('\ne2e smoke: pass')
process.exit(0)

/** People click the first free target on their turn, until the status matches `done`. */
async function playUntil(pages, selector, watcher, done) {
  const deadline = Date.now() + 240000
  while (Date.now() < deadline) {
    if (await watcher.getByText(done).isVisible()) return
    let moved = false
    for (const page of pages) {
      if (!(await page.getByText(/É a sua vez/).isVisible())) continue
      const target = page.locator(selector).first()
      if ((await target.count()) === 0) continue
      await target.click({ timeout: 2000 }).catch(() => {})
      moved = true
      await page.waitForTimeout(80)
      break
    }
    if (!moved) await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('the round did not end')
}

function check(label, condition) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}`)
  if (!condition) failures.push(label)
}

async function newPage(browser, label) {
  const context = await browser.newContext()
  // Counts the cues without needing an audio device.
  await context.addInitScript(() => {
    window.__tones = []
    const proto = window.AudioContext && window.AudioContext.prototype
    if (!proto) return
    const create = proto.createOscillator
    proto.createOscillator = function () {
      const osc = create.call(this)
      const start = osc.start.bind(osc)
      osc.start = (...args) => {
        window.__tones.push(1)
        return start(...args)
      }
      return osc
    }
  })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[${label}] ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    failures.push(`[${label}] page error: ${error.message}`)
  })
  await page.goto(APP_URL)
  return page
}

async function enter(page, name, button, game, room = ROOM) {
  await page.getByRole('radio', { name: game }).click()
  await page.getByLabel('Nome da sala').fill(room)
  await page.getByLabel('Chave da sala').fill(KEY)
  await page.getByLabel('O seu nome').fill(name)
  await page.getByRole('button', { name: 'Broker e credenciais' }).click()
  await page.getByLabel('Broker (WSS)').fill(BROKER_URL)
  await page.getByRole('button', { name: button }).click()
  await page.getByRole('button', { name: /Fechar a sala|Sair/ }).waitFor({ timeout: 20000 })
}

/** Enters through the open room list instead of typing the room name. */

async function totalScore(page) {
  const scores = await page.locator('.player__score').allInnerTexts()
  return scores.reduce((sum, value) => sum + Number(value), 0)
}

async function waitForApp() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(APP_URL)
      if (response.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('the preview server did not start')
}
