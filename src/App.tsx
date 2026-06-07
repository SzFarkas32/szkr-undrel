import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const API_URL = 'https://deckofcardsapi.com/api/deck/new/draw/?count=52'
const MAX_HP = 20
const CARD_BACK = 'https://deckofcardsapi.com/static/img/back.png'

type Suit = 'SPADES' | 'HEARTS' | 'DIAMONDS' | 'CLUBS'
type CardKind = 'monster' | 'weapon' | 'potion'
type GameStatus = 'loading' | 'playing' | 'won' | 'lost' | 'error'

type ApiCard = {
  code: string
  image: string
  value: string
  suit: Suit
}

type DeckApiResponse = {
  success: boolean
  deck_id: string
  remaining: number
  cards: ApiCard[]
}

type GameCard = ApiCard & {
  power: number
  kind: CardKind
  label: string
  suitIcon: string
  color: 'red' | 'black'
}

type WeaponState = {
  card: GameCard
  slain: GameCard[]
}

type GameState = {
  status: GameStatus
  deck: GameCard[]
  room: GameCard[]
  weapon: WeaponState | null
  hp: number
  message: string
  potionUsedThisRoom: boolean
  actionsInRoom: number
  fledLastRoom: boolean
  selectedMonster: GameCard | null
  defeated: number
  turns: number
}

const emptyGame: GameState = {
  status: 'loading',
  deck: [],
  room: [],
  weapon: null,
  hp: MAX_HP,
  message: 'Keverem a dungeont...',
  potionUsedThisRoom: false,
  actionsInRoom: 0,
  fledLastRoom: false,
  selectedMonster: null,
  defeated: 0,
  turns: 0,
}

function getPower(value: string): number {
  if (value === 'ACE') return 14
  if (value === 'KING') return 13
  if (value === 'QUEEN') return 12
  if (value === 'JACK') return 11
  return Number(value)
}

function getSuitIcon(suit: Suit): string {
  if (suit === 'SPADES') return '♠'
  if (suit === 'CLUBS') return '♣'
  if (suit === 'DIAMONDS') return '♦'
  return '♥'
}

function getKind(suit: Suit): CardKind {
  if (suit === 'DIAMONDS') return 'weapon'
  if (suit === 'HEARTS') return 'potion'
  return 'monster'
}

function isRemovedFromScoundrel(card: ApiCard): boolean {
  const isRed = card.suit === 'HEARTS' || card.suit === 'DIAMONDS'
  const isRedAceOrFace = ['ACE', 'KING', 'QUEEN', 'JACK'].includes(card.value)
  return isRed && isRedAceOrFace
}

function toGameCard(card: ApiCard): GameCard {
  const power = getPower(card.value)
  const suitIcon = getSuitIcon(card.suit)
  return {
    ...card,
    power,
    suitIcon,
    kind: getKind(card.suit),
    color: card.suit === 'HEARTS' || card.suit === 'DIAMONDS' ? 'red' : 'black',
    label: `${card.value} ${suitIcon}`,
  }
}

function drawRoom(deck: GameCard[], room: GameCard[]) {
  const nextDeck = [...deck]
  const nextRoom = [...room]

  while (nextRoom.length < 4 && nextDeck.length > 0) {
    const card = nextDeck.shift()
    if (card) nextRoom.push(card)
  }

  return { deck: nextDeck, room: nextRoom }
}

function removeCard(room: GameCard[], card: GameCard) {
  return room.filter((roomCard) => roomCard.code !== card.code)
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function canUseWeapon(monster: GameCard, weapon: WeaponState | null): boolean {
  if (!weapon) return false
  const lastMonsterKilled = weapon.slain[weapon.slain.length - 1]
  return !lastMonsterKilled || monster.power <= lastMonsterKilled.power
}

function buildGame(cards: ApiCard[]): GameState {
  const dungeon = cards.filter((card) => !isRemovedFromScoundrel(card)).map(toGameCard)
  const firstRoom = drawRoom(dungeon, [])

  return {
    ...emptyGame,
    status: 'playing',
    deck: firstRoom.deck,
    room: firstRoom.room,
    message: 'Beléptél a dungeonbe. Válassz 3 lapot a szobából, vagy fuss el.',
  }
}

function countThreat(cards: GameCard[]) {
  return cards
    .filter((card) => card.kind === 'monster')
    .reduce((total, card) => total + card.power, 0)
}

function cardTypeText(card: GameCard) {
  if (card.kind === 'monster') return `Szörny • ${card.power} sebzés`
  if (card.kind === 'weapon') return `Fegyver • ${card.power} erő`
  return `Potion • +${card.power} HP`
}

function finishAction(next: GameState, message: string): GameState {
  let updated: GameState = {
    ...next,
    message,
    selectedMonster: null,
    turns: next.turns + 1,
  }

  if (updated.hp <= 0) {
    const dangerLeft = countThreat([...updated.deck, ...updated.room])
    return {
      ...updated,
      hp: 0,
      status: 'lost',
      message: `Meghaltál a dungeonben. Hátralévő szörny-erő: ${dangerLeft}.`,
    }
  }

  if (updated.deck.length === 0 && updated.room.length === 0) {
    return {
      ...updated,
      status: 'won',
      message: `Kijutottál! A végső pontszámod: ${updated.hp} HP.`,
    }
  }

  if (updated.room.length <= 1 && updated.deck.length > 0) {
    const dealt = drawRoom(updated.deck, updated.room)
    updated = {
      ...updated,
      deck: dealt.deck,
      room: dealt.room,
      potionUsedThisRoom: false,
      actionsInRoom: 0,
      fledLastRoom: false,
      message: `${message} Új szoba nyílt.`,
    }
  }

  return updated
}

export default function App() {
  const [game, setGame] = useState<GameState>(emptyGame)

  const startNewGame = useCallback(async () => {
    setGame({ ...emptyGame })

    try {
      const response = await fetch(API_URL)
      const data = (await response.json()) as DeckApiResponse

      if (!data.success || !Array.isArray(data.cards)) {
        throw new Error('A Deck of Cards API nem adott vissza lapokat.')
      }

      setGame(buildGame(data.cards))
    } catch (error) {
      console.error(error)
      setGame({
        ...emptyGame,
        status: 'error',
        message: 'Nem sikerült lekérni a paklit. Ellenőrizd a netet vagy próbáld újra.',
      })
    }
  }, [])

  useEffect(() => {
    void startNewGame()
  }, [startNewGame])

  const canFlee =
    game.status === 'playing' &&
    game.room.length === 4 &&
    game.actionsInRoom === 0 &&
    !game.fledLastRoom

  const hpPercent = Math.max(0, Math.min(100, (game.hp / MAX_HP) * 100))

  const dungeonThreat = useMemo(
    () => countThreat([...game.deck, ...game.room]),
    [game.deck, game.room],
  )

  function fleeRoom() {
    setGame((current) => {
      const allowed =
        current.status === 'playing' &&
        current.room.length === 4 &&
        current.actionsInRoom === 0 &&
        !current.fledLastRoom

      if (!allowed) return current

      const returnedCards = shuffle(current.room)
      const nextDungeon = [...current.deck, ...returnedCards]
      const dealt = drawRoom(nextDungeon, [])

      return {
        ...current,
        deck: dealt.deck,
        room: dealt.room,
        potionUsedThisRoom: false,
        actionsInRoom: 0,
        fledLastRoom: true,
        selectedMonster: null,
        turns: current.turns + 1,
        message: 'Gyáva? Inkább taktikus. Elfutottál, de kétszer egymás után nem lehet.',
      }
    })
  }

  function handlePotion(card: GameCard) {
    setGame((current) => {
      if (current.status !== 'playing') return current

      const healed = current.potionUsedThisRoom ? 0 : card.power
      const nextHp = current.potionUsedThisRoom
        ? current.hp
        : Math.min(MAX_HP, current.hp + card.power)

      const next: GameState = {
        ...current,
        room: removeCard(current.room, card),
        hp: nextHp,
        potionUsedThisRoom: true,
        actionsInRoom: current.actionsInRoom + 1,
      }

      const message = healed > 0
        ? `Megittál egy potiont: +${healed} HP.`
        : 'Ez már a második potion ebben a szobában, ezért nem gyógyított.'

      return finishAction(next, message)
    })
  }

  function handleWeapon(card: GameCard) {
    setGame((current) => {
      if (current.status !== 'playing') return current

      const oldWeaponText = current.weapon ? ` A régi ${current.weapon.card.power}-es fegyvert eldobtad.` : ''
      const next: GameState = {
        ...current,
        room: removeCard(current.room, card),
        weapon: { card, slain: [] },
        actionsInRoom: current.actionsInRoom + 1,
      }

      return finishAction(next, `Felvetted a ${card.power}-es fegyvert.${oldWeaponText}`)
    })
  }

  function selectMonster(card: GameCard) {
    setGame((current) => {
      if (current.status !== 'playing') return current
      return {
        ...current,
        selectedMonster: current.selectedMonster?.code === card.code ? null : card,
        message: `Szörny kiválasztva: ${card.label}. Válassz támadási módot.`,
      }
    })
  }

  function handleCardClick(card: GameCard) {
    if (card.kind === 'potion') handlePotion(card)
    if (card.kind === 'weapon') handleWeapon(card)
    if (card.kind === 'monster') selectMonster(card)
  }

  function fightMonster(useWeapon: boolean) {
    setGame((current) => {
      if (current.status !== 'playing' || !current.selectedMonster) return current

      const monster = current.selectedMonster
      let damage = monster.power
      let weapon = current.weapon
      let message = `Puszta kézzel legyőzted a ${monster.power}-es szörnyet, de ${damage} sebzést kaptál.`

      if (useWeapon && canUseWeapon(monster, current.weapon) && current.weapon) {
        damage = Math.max(0, monster.power - current.weapon.card.power)
        weapon = {
          ...current.weapon,
          slain: [...current.weapon.slain, monster],
        }
        message = `Fegyverrel támadtál. Szörny: ${monster.power}, fegyver: ${current.weapon.card.power}, sebzés: ${damage}.`
      }

      const next: GameState = {
        ...current,
        room: removeCard(current.room, monster),
        weapon,
        hp: current.hp - damage,
        actionsInRoom: current.actionsInRoom + 1,
        defeated: current.defeated + 1,
      }

      return finishAction(next, message)
    })
  }

  const selectedMonster = game.selectedMonster
  const weaponLimit = game.weapon?.slain.at(-1)?.power ?? null
  const selectedCanUseWeapon = selectedMonster ? canUseWeapon(selectedMonster, game.weapon) : false

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Deck of Cards API • React • Scoundrel</p>
          <h1>Scoundrel Dungeon</h1>
          <p className="subtitle">
            Egy pakli, 44 lap, 20 HP, és egy dungeon, ami nagyon szeretne megölni.
          </p>
        </div>

        <button className="primary-button" onClick={startNewGame}>
          🔁 Új dungeon
        </button>
      </section>

      <section className="dashboard">
        <article className="stat-card hp-card">
          <span>HP</span>
          <strong>{game.hp}/{MAX_HP}</strong>
          <div className="hp-bar" aria-label="Életerő">
            <div style={{ width: `${hpPercent}%` }} />
          </div>
        </article>

        <article className="stat-card">
          <span>Dungeon</span>
          <strong>{game.deck.length}</strong>
          <small>lap maradt</small>
        </article>

        <article className="stat-card">
          <span>Szoba</span>
          <strong>{game.room.length}</strong>
          <small>látható lap</small>
        </article>

        <article className="stat-card">
          <span>Threat</span>
          <strong>{dungeonThreat}</strong>
          <small>szörny-erő</small>
        </article>
      </section>

      <section className="message-row">
        <p>{game.message}</p>
        <button className="flee-button" onClick={fleeRoom} disabled={!canFlee}>
          🏃 Elfutok
        </button>
      </section>

      {game.status === 'loading' && (
        <section className="center-panel">
          <div className="loader" />
          <h2>Pakli lekérése...</h2>
          <p>A Deck of Cards API-ból jönnek a lapok.</p>
        </section>
      )}

      {game.status === 'error' && (
        <section className="center-panel danger-panel">
          <h2>Nem jött össze 😵</h2>
          <p>{game.message}</p>
          <button className="primary-button" onClick={startNewGame}>Újrapróbálom</button>
        </section>
      )}

      {(game.status === 'won' || game.status === 'lost') && (
        <section className={`end-screen ${game.status}`}>
          <h2>{game.status === 'won' ? 'Túlélted!' : 'Elbuktál!'}</h2>
          <p>{game.message}</p>
          <p>Körök: {game.turns} • Legyőzött szörnyek: {game.defeated}</p>
          <button className="primary-button" onClick={startNewGame}>Még egy menet</button>
        </section>
      )}

      {game.status === 'playing' && (
        <div className="game-grid">
          <section className="room-panel">
            <div className="section-title">
              <div>
                <p className="eyebrow">Aktuális szoba</p>
                <h2>Válassz lapot</h2>
              </div>
              <img className="deck-back" src={CARD_BACK} alt="Kártya hátlap" />
            </div>

            <div className="room-cards">
              {game.room.map((card) => (
                <button
                  key={card.code}
                  className={`playing-card ${card.kind} ${card.color} ${selectedMonster?.code === card.code ? 'selected' : ''}`}
                  onClick={() => handleCardClick(card)}
                >
                  <img src={card.image} alt={card.label} />
                  <span className="card-chip">{cardTypeText(card)}</span>
                </button>
              ))}
            </div>

            {selectedMonster && (
              <div className="fight-box">
                <div>
                  <strong>{selectedMonster.label}</strong>
                  <p>Hogyan támadod meg?</p>
                </div>
                <div className="fight-actions">
                  <button
                    className="weapon-button"
                    disabled={!selectedCanUseWeapon}
                    onClick={() => fightMonster(true)}
                  >
                    ⚔️ Fegyverrel
                  </button>
                  <button className="fist-button" onClick={() => fightMonster(false)}>
                    👊 Puszta kézzel
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className="side-panel">
            <section className="weapon-panel">
              <p className="eyebrow">Fegyvered</p>
              {game.weapon ? (
                <>
                  <div className="weapon-card-row">
                    <img src={game.weapon.card.image} alt={game.weapon.card.label} />
                    <div>
                      <h2>{game.weapon.card.power} erő</h2>
                      <p>
                        Limit:{' '}
                        {weaponLimit === null ? 'bármilyen első szörny' : `${weaponLimit} vagy kisebb`}
                      </p>
                    </div>
                  </div>
                  <div className="slain-list">
                    {game.weapon.slain.length === 0 ? (
                      <small>Még nem csorbult ki.</small>
                    ) : (
                      game.weapon.slain.map((monster) => (
                        <span key={monster.code}>{monster.power}</span>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="no-weapon">
                  <span>👊</span>
                  <p>Nincs fegyvered. A puszta ököl 0 erő.</p>
                </div>
              )}
            </section>

            <section className="rules-panel">
              <p className="eyebrow">Gyors szabály</p>
              <ul>
                <li>♠/♣ = szörny, sebzést okoz.</li>
                <li>♦ = fegyver, csökkenti a sebzést.</li>
                <li>♥ = potion, de szobánként csak egy gyógyít.</li>
                <li>Ha 1 lap marad, jön az új szoba.</li>
                <li>Elfutni lehet, de nem kétszer egymás után.</li>
              </ul>
            </section>
          </aside>
        </div>
      )}
    </main>
  )
}
