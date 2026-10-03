export type Winner = { id: string; name: string; ticketIndex: number; rowIndex: number }
export type Player = {
  id: string
  name: string
  isHost: boolean
  ticket: (number | null)[][][]
  status: 'near' | 'kinh' | null
}
export type RoomState = {
  code: string
  hostId: string
  drawnNumbers: number[]
  maxNumber: number
  finished: boolean
  winners: Winner[]
  players: Player[]
}
type PlayerInput = Pick<Player, 'id' | 'name' | 'ticket'>

export function createRoomCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

function shuffle<T>(items: T[]) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]]
  }
  return shuffled
}

export function createTicket() {
  const pattern = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [1, 2, 3, 4, 5],
  ]
  const singleColumns = shuffle(Array.from({ length: 9 }, (_, index) => index))
  const ticketRows = Array.from({ length: 3 }, (_, ticketIndex) => {
    const singles = singleColumns.slice(ticketIndex * 3, ticketIndex * 3 + 3)
    const doubles = shuffle(singleColumns.filter((column) => !singles.includes(column)))
    const columnMap = (column: number) => column < 6 ? doubles[column] : singles[column - 6]
    return pattern.map((row) => row.map(columnMap))
  })
  const tickets = ticketRows.map((rows) => rows.map(() => Array<number | null>(9).fill(null)))

  for (let column = 0; column < 9; column += 1) {
    const cells = ticketRows.flatMap((rows, ticketIndex) => rows.flatMap((row, rowIndex) =>
      row.includes(column) ? [{ ticketIndex, rowIndex }] : [],
    ))
    const minimum = column === 0 ? 1 : column * 10
    const maximum = column === 8 ? 90 : column * 10 + 9
    const values = shuffle(Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index))
      .slice(0, cells.length)
      .sort((left, right) => left - right)

    cells.forEach(({ ticketIndex, rowIndex }, index) => {
      tickets[ticketIndex][rowIndex][column] = values[index]
    })
  }

  return tickets
}

export function makeRoomState(
  code: string,
  hostId: string,
  drawnNumbers: number[],
  finished: boolean,
  winners: Winner[],
  players: PlayerInput[],
): RoomState {
  return {
    code,
    hostId,
    drawnNumbers,
    maxNumber: 90,
    finished,
    winners,
    players: players.map((player) => {
      const rowHits = player.ticket.flatMap((ticket) => ticket.map((row) =>
        row.filter((number) => number !== null && drawnNumbers.includes(number)).length,
      ))
      return {
        ...player,
        isHost: player.id === hostId,
        status: rowHits.includes(5) ? 'kinh' : rowHits.includes(4) ? 'near' : null,
      }
    }),
  }
}

export function drawNextNumber(room: RoomState) {
  const available = Array.from({ length: room.maxNumber }, (_, index) => index + 1)
    .filter((number) => !room.drawnNumbers.includes(number))
  if (!available.length || room.finished) return { room, announcement: '' }

  const number = available[Math.floor(Math.random() * available.length)]
  const previousDrawn = new Set(room.drawnNumbers)
  const drawnNumbers = [...room.drawnNumbers, number]
  const nearAnnouncements: string[] = []
  const winners = new Map<string, Winner>()
  for (const player of room.players) {
    player.ticket.forEach((ticket, ticketIndex) => {
      ticket.forEach((row, rowIndex) => {
        if (!row.includes(number)) return
        const previousHits = row.filter((value) => value !== null && previousDrawn.has(value)).length
        const currentHits = previousHits + 1
        if (currentHits === 5) {
          winners.set(player.id, { id: player.id, name: player.name, ticketIndex, rowIndex })
        } else if (currentHits === 4) {
          nearAnnouncements.push(`${player.name} sắp KINH ở vé ${ticketIndex + 1}, hàng ${rowIndex + 1}.`)
        }
      })
    })
  }

  const roundWinners = [...winners.values()]
  const finished = roundWinners.length > 0
  const announcement = finished
    ? `${roundWinners.map((winner) => winner.name).join(', ')} đã KINH! Trò chơi dừng.`
    : nearAnnouncements.join(' ')
  return {
    room: makeRoomState(room.code, room.hostId, drawnNumbers, finished, finished ? roundWinners : [], room.players),
    announcement,
  }
}
