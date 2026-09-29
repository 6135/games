/**
 * End to end smoke test. Runs a local broker, serves the build and plays one
 * full round with two browsers.
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
const APP_URL = `http://127.0.0.1:${APP_PORT}/forca-multiplayer/`
const BROKER_URL = `ws://127.0.0.1:${BROKER_PORT}`
const ROOM = 'sala de teste'
const KEY = 'chave-secreta'
const WORD = 'gato'
// A composite word. A line break must never cut one of its words in two.
const WORD2 = 'league of legends'
const WORD2_LETTERS = ['L', 'E', 'A', 'G', 'U', 'O', 'F', 'N', 'D', 'S']

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
})
process.on('exit', () => preview.kill('SIGKILL'))
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    preview.kill('SIGKILL')
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
  const host = await newPage(browser, 'ana')
  const guest = await newPage(browser, 'bruno')
  const third = await newPage(browser, 'carla')

  await enter(host, 'ana', 'Criar sala')
  await enter(guest, 'bruno', 'Entrar')
  // The third player picks the room from the open list, so the join uses the
  // published room identifier and never derives one from the name.
  await enterFromList(third, 'carla')

  await host.getByText('bruno').first().waitFor({ timeout: 15000 })
  await host.getByText('carla').first().waitFor({ timeout: 15000 })
  check('every player is on the roster', (await host.locator('.player').count()) === 3)
  await host.getByRole('button', { name: 'Começar o jogo' }).click()

  const pages = [
    { page: host, name: 'ana' },
    { page: guest, name: 'bruno' },
    { page: third, name: 'carla' },
  ]
  const masterEntry = await findMaster(pages)
  const master = masterEntry.page
  const other = pages.find((entry) => entry.page !== master).page
  await master.getByRole('heading', { name: 'É a sua ronda' }).waitFor({ timeout: 15000 })
  await master.getByLabel('Categoria').fill('animais')
  await master.getByLabel('Palavra').fill(WORD)
  await master.getByRole('button', { name: 'Começar a ronda' }).click()

  await other.getByText('Categoria:').waitFor({ timeout: 15000 })
  check('the other device sees the empty slots', (await other.locator('.slot--empty').count()) === 4)
  check('the word never reaches the other device', !(await other.content()).includes(WORD))

  await master.getByRole('button', { name: 'Z', exact: true }).click()
  await other.getByText('Letras erradas: Z').waitFor({ timeout: 10000 })
  check('a miss costs one life', (await other.getByText('Vidas:').innerText()).includes('5'))
  check('a miss makes a sound', (await tones(other)) > 0)

  // A muted device must stay silent.
  await other.getByRole('button', { name: 'Desligar o som' }).click()
  const quietFrom = await tones(other)
  await master.getByRole('button', { name: 'G', exact: true }).click()
  await other.getByText('Vidas:').waitFor({ timeout: 10000 })
  await other.waitForTimeout(600)
  check('a muted device stays silent', (await tones(other)) === quietFrom)
  await other.getByRole('button', { name: 'Ligar o som' }).click()

  for (const letter of ['A', 'T', 'O']) {
    await master.getByRole('button', { name: letter, exact: true }).click()
  }

  await other.getByText(`A palavra era ${WORD}`).waitFor({ timeout: 15000 })
  check('the host applied one point', (await totalScore(host)) === 1)

  await host.getByRole('button', { name: 'Próxima ronda' }).click()
  await host.getByText('Ronda 2').waitFor({ timeout: 10000 })
  check('the retained round was cleared', (await other.locator('.board').count()) === 0)

  // Round two runs with another master, so `round` and `round/end` carry a
  // second publisher with a counter that starts again at one.
  const secondEntry = await findMaster(pages)
  const second = secondEntry.page
  // The watcher must outlive the host, because the host closes at the end.
  const watcher = pages.find((entry) => entry.page !== second && entry.page !== host).page
  check('the master changed with the frozen order', secondEntry.name !== masterEntry.name)
  await second.getByLabel('Categoria').fill('jogos')
  await second.getByLabel('Palavra').fill(WORD2)
  await second.getByRole('button', { name: 'Começar a ronda' }).click()
  // A narrow screen is where a word breaks in two.
  await watcher.setViewportSize({ width: 380, height: 800 })
  await watcher.getByText('Categoria:').waitFor({ timeout: 15000 })
  check('a word never breaks across two lines', await wordsStayWhole(watcher))
  for (const letter of WORD2_LETTERS) {
    await second.getByRole('button', { name: letter, exact: true }).click()
  }
  await watcher.getByText(`A palavra era ${WORD2}`).waitFor({ timeout: 15000 })
  check('the second round also scored', (await totalScore(host)) === 2)

  // The history screen: the words, the writer and the winner.
  await watcher.getByRole('button', { name: /Histórico/ }).click()
  await watcher.getByRole('heading', { name: 'Palavras anteriores' }).waitFor({ timeout: 10000 })
  check('the history lists both rounds', (await watcher.locator('.history__row').count()) === 2)
  const historyText = await watcher.locator('.history__list').innerText()
  check('the history holds both words', historyText.includes(WORD) && historyText.includes(WORD2))
  check(
    'the history says who wrote and who won',
    historyText.includes('escrita por') && historyText.includes('ganha por'),
  )
  await watcher.getByRole('button', { name: 'Fechar' }).click()

  // A restart returns the room to the lobby with the same people in it.
  await host.getByRole('button', { name: 'Reiniciar a sala' }).click()
  await watcher.getByRole('heading', { name: 'À espera de jogadores' }).waitFor({ timeout: 10000 })
  check('a restart keeps every player', (await host.locator('.player').count()) === 3)
  check('a restart clears the scores', (await totalScore(host)) === 0)
  check(
    'a restart clears the history',
    (await host.getByRole('button', { name: /Histórico/ }).innerText()).trim() === 'Histórico',
  )
  await host.getByRole('button', { name: 'Começar o jogo' }).click()
  await watcher.getByText('Ronda 1').waitFor({ timeout: 10000 })
  check('the room plays again with no reconnection', true)

  // A restart during a live round asks for a second click, and drops the word.
  const reborn = await findMaster(pages)
  await reborn.page.getByLabel('Categoria').fill('teste')
  await reborn.page.getByLabel('Palavra').fill('ola')
  await reborn.page.getByRole('button', { name: 'Começar a ronda' }).click()
  await watcher.getByText('Categoria:').waitFor({ timeout: 15000 })
  await host.getByRole('button', { name: 'Reiniciar a sala' }).click()
  check(
    'a live restart asks for a second click',
    await host.getByRole('button', { name: 'Confirmar o reinício' }).isVisible(),
  )
  check('the round is still live before the second click', (await watcher.locator('.board').count()) === 1)
  await host.getByRole('button', { name: 'Confirmar o reinício' }).click()
  await watcher.getByRole('heading', { name: 'À espera de jogadores' }).waitFor({ timeout: 10000 })
  check('a live restart clears the board', (await watcher.locator('.board').count()) === 0)

  // Constraint C5: the Last Will closes the room when the host connection dies.
  await host.context().close()
  await watcher.getByText('O anfitrião saiu. A sala fechou.').waitFor({ timeout: 20000 })
  check('a lost host closes the room', true)
} catch (error) {
  failures.push(`threw: ${error.message}`)
} finally {
  await browser.close()
  preview.kill('SIGKILL')
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

async function enter(page, name, button) {
  await page.getByLabel('Nome da sala').fill(ROOM)
  await page.getByLabel('Chave da sala').fill(KEY)
  await page.getByLabel('O seu nome').fill(name)
  await page.getByRole('button', { name: 'Broker e credenciais' }).click()
  await page.getByLabel('Broker (WSS)').fill(BROKER_URL)
  await page.getByRole('button', { name: button }).click()
  await page.getByRole('button', { name: /Fechar a sala|Sair/ }).waitFor({ timeout: 20000 })
}

/** Enters through the open room list instead of typing the room name. */
async function enterFromList(page, name) {
  await page.getByRole('button', { name: 'Broker e credenciais' }).click()
  await page.getByLabel('Broker (WSS)').fill(BROKER_URL)
  await page.getByRole('button', { name: new RegExp(ROOM) }).click({ timeout: 25000 })
  await page.getByLabel('Chave da sala').fill(KEY)
  await page.getByLabel('O seu nome').fill(name)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByRole('button', { name: /Fechar a sala|Sair/ }).waitFor({ timeout: 20000 })
}

async function findMaster(pages) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    for (const entry of pages) {
      if (await entry.page.getByRole('heading', { name: 'É a sua ronda' }).isVisible()) {
        return entry
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('no device took the round master role')
}

/** Every slot of one word must sit on the same row. */
async function wordsStayWhole(page) {
  return page.evaluate(() => {
    const words = [...document.querySelectorAll('.slots .word')]
    if (words.length < 2) return false
    return words.every((word) => {
      const rows = new Set(
        [...word.querySelectorAll('.slot')].map((slot) => slot.getBoundingClientRect().top),
      )
      return rows.size === 1
    })
  })
}

function tones(page) {
  return page.evaluate(() => window.__tones.length)
}

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
