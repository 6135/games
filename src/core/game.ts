/**
 * What a game plugs into the core. The core runs the room: connection, join,
 * presence, roster, lobby. A game brings its rules, its round topics and its
 * screen.
 */

import type { ComponentType } from 'react'
import type { HostCore, HostDeps } from './host'
import type { RoomLink } from './net/mqtt'
import type { Topics } from './net/topics'
import type { Identity } from './store'
import type { CoreRoom, GameId } from './types'

export type ClientDeps = {
  link: RoomLink
  topics: Topics
  identity: Identity
  /** Set on the host device. The client can then skip the network. */
  host: HostCore<CoreRoom, { type: string }> | null
}

/** The part of a game that runs on every device, the host included. */
export type GameClient = {
  /** A message on a round topic. */
  onMessage: (topic: string, message: Record<string, unknown>) => void
  /** A new retained roster. */
  onRoster: (roster: CoreRoom) => void
  /** A retained topic was cleared. */
  onCleared: (topic: string) => void
  dispose: () => void
}

export type GameModule = {
  id: GameId
  title: string
  /** One line for the lobby. */
  description: string
  /** Topic prefix. It also enters the room identifier and the key derivation. */
  protocol: string
  /** Shows the bot controls in the host panel. */
  bots: boolean
  minPlayers: number
  createHost: (deps: HostDeps) => HostCore<CoreRoom, { type: string }>
  createClient: (deps: ClientDeps) => GameClient
  /** The room screen. Loaded on demand. */
  Room: ComponentType
}
