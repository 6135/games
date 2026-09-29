/**
 * Reads the room traffic in clear text.
 *
 * A generic MQTT client cannot show these payloads: they are AES-GCM binary,
 * and a client that decodes a payload as UTF-8 drops them. This script uses
 * the same derivation as the application, so it prints the real messages.
 *
 * Usage:
 *   npm run sniff -- "<room name>" "<room key>" [broker url]
 *   npm run sniff                      (no key: topics only, no payloads)
 */

import mqtt from 'mqtt'
import { deriveRoomId, newClientId, topicsFor, PROTOCOL } from '../src/net/topics'
import { deriveRoomCryptoKey, open } from '../src/net/crypto'

const DEFAULT_BROKER = 'wss://broker.hivemq.com:8884/mqtt'

const [roomName, roomKey, brokerArg] = process.argv.slice(2)
const brokerUrl = brokerArg ?? DEFAULT_BROKER

const key = roomName && roomKey ? await derive(roomName, roomKey) : null
const filter = key ? `${topicsFor(key.roomId).prefix}/#` : `${PROTOCOL}/#`

async function derive(name: string, secret: string) {
  const roomId = await deriveRoomId(name, secret)
  return { roomId, cryptoKey: await deriveRoomCryptoKey(secret, roomId) }
}

console.log(`broker  ${brokerUrl}`)
if (key) console.log(`room    "${roomName}" -> ${key.roomId}`)
console.log(`filter  ${filter}`)
console.log(key ? '' : 'no room name and key: the payloads stay unreadable\n')

const client = mqtt.connect(brokerUrl, {
  clientId: newClientId().replace('forca-', 'sniff-'),
  clean: true,
  keepalive: 30,
  reconnectPeriod: 2000,
})

client.on('connect', () => {
  client.subscribe(filter, { qos: 1 })
  console.log('connected. waiting for traffic. ctrl-c to stop.\n')
})
// A dead broker repeats the same error every two seconds. Say it once.
let lastError = ''
client.on('error', (error) => {
  if (error.message === lastError) return
  lastError = error.message
  console.error(`error: ${error.message}`)
})

client.on('message', (topic, payload, packet) => {
  const time = new Date().toISOString().slice(11, 23)
  const flags = [`${payload.length}B`, `qos${packet.qos}`, packet.retain ? 'retained' : 'live']
  const short = topic.split('/').slice(2).join('/')

  if (payload.length === 0) {
    console.log(`${time}  ${short}  [${flags.join(' ')}]  <cleared>`)
    return
  }
  if (!key) {
    console.log(`${time}  ${short}  [${flags.join(' ')}]`)
    return
  }
  void open(key.cryptoKey, topic, new Uint8Array(payload)).then((message) => {
    if (message === null) {
      console.log(`${time}  ${short}  [${flags.join(' ')}]  <another room, or a wrong key>`)
      return
    }
    console.log(`${time}  ${short}  [${flags.join(' ')}]\n${format(message)}`)
  })
})

/** Keeps one message on a few readable lines. */
function format(message: unknown): string {
  const text = JSON.stringify(message, replacer, 1).replace(/\n\s*/g, ' ')
  return `        ${text}`
}

function replacer(_key: string, value: unknown): unknown {
  if (Array.isArray(value) && value.length > 0 && isSlot(value[0])) {
    return value.map((slot) => (slot as { char: string | null }).char ?? '_').join('')
  }
  return value
}

function isSlot(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'kind' in value
}
