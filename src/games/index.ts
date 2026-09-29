/** Every game the lobby offers. A new game adds one entry here. */

import { lazy } from 'react'
import type { GameModule } from '../core/game'
import type { GameId } from '../core/types'
import { ForcaHost } from './forca/host'
import { ForcaClient } from './forca/client'
import { GaloHost } from './galo/host'
import { GaloClient } from './galo/client'
import { MIN_PLAYERS as GALO_MIN } from './galo/rules'
import { PontosHost } from './pontos/host'
import { PontosClient } from './pontos/client'
import { MIN_PLAYERS as PONTOS_MIN } from './pontos/rules'
import { NavalHost } from './naval/host'
import { NavalClient } from './naval/client'
import { MIN_PLAYERS as NAVAL_MIN } from './naval/rules'

export const GAMES: Record<GameId, GameModule> = {
  forca: {
    id: 'forca',
    title: 'Forca',
    description: 'Um mestre escreve a palavra. Os outros adivinham letra a letra.',
    protocol: 'forca/v1',
    bots: false,
    minPlayers: 2,
    createHost: (deps) => new ForcaHost(deps),
    createClient: (deps) => new ForcaClient(deps),
    Room: lazy(() => import('./forca/ForcaRoom')),
  },
  galo: {
    id: 'galo',
    title: 'Galo',
    description: 'Jogo do galo para N jogadores. A grelha cresce com os jogadores. Tem bots.',
    protocol: 'galo/v1',
    bots: true,
    minPlayers: GALO_MIN,
    createHost: (deps) => new GaloHost(deps),
    createClient: (deps) => new GaloClient(deps),
    Room: lazy(() => import('./galo/GaloRoom')),
  },
  pontos: {
    id: 'pontos',
    title: 'Pontos e Quadrados',
    description: 'Desenhe linhas. Quem fecha um quadrado fica com ele e joga outra vez. Tem bots.',
    protocol: 'pontos/v1',
    bots: true,
    minPlayers: PONTOS_MIN,
    createHost: (deps) => new PontosHost(deps),
    createClient: (deps) => new PontosClient(deps),
    Room: lazy(() => import('./pontos/PontosRoom')),
  },
  naval: {
    id: 'naval',
    title: 'Batalha Naval',
    description: 'Cada frota fica no seu dispositivo. Todos contra todos, verificado no fim. Tem bots.',
    protocol: 'naval/v1',
    bots: true,
    minPlayers: NAVAL_MIN,
    createHost: (deps) => new NavalHost(deps),
    createClient: (deps) => new NavalClient(deps),
    Room: lazy(() => import('./naval/NavalRoom')),
  },
}

export const GAME_LIST = Object.values(GAMES)

export function isGameId(value: string | null | undefined): value is GameId {
  return value === 'forca' || value === 'galo' || value === 'pontos' || value === 'naval'
}

/** The game that owns a protocol prefix, for the open room list. */
export function gameOfProtocol(protocol: string): GameModule | undefined {
  return GAME_LIST.find((game) => game.protocol === protocol)
}
