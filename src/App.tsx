import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Copy, Dices, DoorOpen, RotateCcw, Trophy, Users, Wifi, X } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { createRoomCode, createTicket, drawNextNumber, makeRoomState, type RoomState } from './lotto'
import './App.css'

const currentYear = new Date().getFullYear()

function App() {
  const [clientId] = useState(() => crypto.randomUUID())
  const clientIdRef = useRef(clientId)
  const roomChannelRef = useRef<RealtimeChannel | null>(null)
  const roomRef = useRef<RoomState | null>(null)
  const joinTimeoutRef = useRef<number | null>(null)
  const finishedRef = useRef(false)
  const [connected, setConnected] = useState(false)
  const [room, setRoom] = useState<RoomState | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState(
    supabase ? '' : 'Thiếu cấu hình Supabase. Hãy tạo file .env.local theo hướng dẫn trong README.',
  )
  const [copied, setCopied] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [winnerDialogOpen, setWinnerDialogOpen] = useState(false)

  useEffect(() => {
    if (!supabase) return

    const lobby = supabase.channel(`lotto-lobby-${clientId}`)
    lobby.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED')
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setError('Không thể kết nối Supabase Realtime. Hãy kiểm tra cấu hình và kết nối mạng.')
      }
    })
    return () => {
      if (joinTimeoutRef.current !== null) window.clearTimeout(joinTimeoutRef.current)
      if (roomChannelRef.current) void roomChannelRef.current.unsubscribe()
      void lobby.unsubscribe()
    }
  }, [clientId])

  const applyRoom = (nextRoom: RoomState) => {
    roomRef.current = nextRoom
    setRoom(nextRoom)
    setError('')
    if (nextRoom.finished && !finishedRef.current) setWinnerDialogOpen(true)
    if (!nextRoom.finished) setWinnerDialogOpen(false)
    finishedRef.current = nextRoom.finished
  }

  const sendRoomState = async (nextRoom: RoomState) => {
    applyRoom(nextRoom)
    const channel = roomChannelRef.current
    if (!channel) return
    const status = await channel.send({ type: 'broadcast', event: 'room-state', payload: nextRoom })
    if (status !== 'ok') setError('Không thể đồng bộ phòng. Hãy thử lại.')
  }

  const createRoomChannel = (code: string) => {
    if (!supabase) throw new Error('Thiếu cấu hình Supabase.')
    const id = clientIdRef.current
    const channel = supabase.channel(`lotto-room-${code}`, {
      config: { broadcast: { self: false }, presence: { key: id } },
    })
    channel
      .on('broadcast', { event: 'room-state' }, ({ payload }) => {
        if (!payload || typeof payload !== 'object' || !Array.isArray(payload.players)) return
        const nextRoom = payload as RoomState
        applyRoom(nextRoom)
        if (nextRoom.players.some((player) => player.id === id) && joinTimeoutRef.current !== null) {
          window.clearTimeout(joinTimeoutRef.current)
          joinTimeoutRef.current = null
        }
      })
      .on('broadcast', { event: 'room-request' }, async ({ payload }) => {
        const current = roomRef.current
        if (!current || current.hostId !== id || !payload || typeof payload !== 'object') return
        const request = payload as { id?: string; name?: string; ticket?: (number | null)[][][] }
        if (typeof request.id !== 'string' || typeof request.name !== 'string' || !request.ticket) return
        const players = current.players.filter((player) => player.id !== request.id)
        players.push({ id: request.id, name: request.name, ticket: request.ticket, isHost: false, status: null })
        await sendRoomState(makeRoomState(current.code, current.hostId, current.drawnNumbers, current.finished, current.winners, players))
      })
      .on('broadcast', { event: 'room-request-state' }, async () => {
        const current = roomRef.current
        if (current?.hostId === id) {
          const status = await channel.send({ type: 'broadcast', event: 'room-state', payload: current })
          if (status !== 'ok') setError('Không thể tải trạng thái phòng. Hãy thử lại.')
        }
      })
      .on('broadcast', { event: 'room-action' }, async ({ payload }) => {
        const current = roomRef.current
        if (!current || current.hostId !== id || !payload || typeof payload !== 'object') return
        const action = payload as { type?: string; playerId?: string }
        if (action.type === 'draw' && action.playerId === current.hostId) {
          const result = drawNextNumber(current)
          if (result.announcement) {
            setAnnouncement(result.announcement)
            const status = await channel.send({ type: 'broadcast', event: 'room-announcement', payload: result.announcement })
            if (status !== 'ok') setError('Không thể đồng bộ thông báo.')
          }
          await sendRoomState(result.room)
        } else if (action.type === 'reset' && action.playerId === current.hostId) {
          setAnnouncement('')
          await sendRoomState(makeRoomState(current.code, current.hostId, [], false, [], current.players))
        } else if (action.type === 'leave' && typeof action.playerId === 'string') {
          const players = current.players.filter((player) => player.id !== action.playerId)
          if (!players.length) return
          const hostId = current.hostId === action.playerId ? players[0].id : current.hostId
          await sendRoomState(makeRoomState(current.code, hostId, current.drawnNumbers, current.finished, current.winners, players))
        }
      })
      .on('broadcast', { event: 'room-announcement' }, ({ payload }) => {
        if (typeof payload === 'string') setAnnouncement(payload)
      })
      .on('presence', { event: 'sync' }, async () => {
        const current = roomRef.current
        if (!current) return
        const onlineIds = new Set(
          Object.values(channel.presenceState<{ playerId?: string }>()).flat().flatMap((presence) =>
            typeof presence.playerId === 'string' ? [presence.playerId] : [],
          ),
        )
        const players = current.players.filter((player) => onlineIds.has(player.id))
        if (!players.length) return
        const hostId = onlineIds.has(current.hostId) ? current.hostId : players[0].id
        if (players.length !== current.players.length || hostId !== current.hostId) {
          await sendRoomState(makeRoomState(current.code, hostId, current.drawnNumbers, current.finished, current.winners, players))
        }
      })
    return channel
  }

  const openRoomChannel = async (code: string) => {
    if (!supabase) throw new Error('Thiếu cấu hình Supabase.')
    if (roomChannelRef.current) await roomChannelRef.current.unsubscribe()
    const channel = createRoomChannel(code)
    roomChannelRef.current = channel
    const result = await new Promise<'SUBSCRIBED' | 'ERROR'>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve('SUBSCRIBED')
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') resolve('ERROR')
      })
    })
    if (result !== 'SUBSCRIBED') {
      roomChannelRef.current = null
      throw new Error('Không thể kết nối kênh phòng qua Supabase Realtime.')
    }
    const presenceStatus = await channel.track({ playerId: clientIdRef.current })
    if (presenceStatus !== 'ok') throw new Error('Không thể đăng ký trạng thái người chơi trong phòng.')
    return channel
  }

  const createRoom = async () => {
    if (!playerName.trim()) return setError('Nhập tên của bạn để tạo phòng.')
    if (!supabase) return setError('Thiếu cấu hình Supabase. Hãy tạo file .env.local theo hướng dẫn trong README.')
    setError('')
    setAnnouncement('')
    setWinnerDialogOpen(false)
    try {
      const code = createRoomCode()
      await openRoomChannel(code)
      const hostId = clientIdRef.current
      const players = [{ id: hostId, name: playerName.trim().slice(0, 18), ticket: createTicket(), isHost: true as const, status: null }]
      await sendRoomState(makeRoomState(code, hostId, [], false, [], players))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo phòng.')
    }
  }

  const joinRoom = async () => {
    if (!playerName.trim()) return setError('Nhập tên của bạn trước khi vào phòng.')
    if (!roomCode.trim()) return setError('Nhập mã phòng để tiếp tục.')
    if (!supabase) return setError('Thiếu cấu hình Supabase. Hãy tạo file .env.local theo hướng dẫn trong README.')
    setError('')
    setAnnouncement('')
    setWinnerDialogOpen(false)
    try {
      const code = roomCode.trim().toUpperCase().replace(/\s/g, '')
      if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(code)) return setError('Mã phòng không hợp lệ.')
      const channel = await openRoomChannel(code)
      const status = await channel.send({
        type: 'broadcast',
        event: 'room-request',
        payload: { id: clientIdRef.current, name: playerName.trim().slice(0, 18), ticket: createTicket() },
      })
      if (status !== 'ok') throw new Error('Không thể gửi yêu cầu vào phòng.')
      joinTimeoutRef.current = window.setTimeout(() => {
        if (!roomRef.current?.players.some((player) => player.id === clientIdRef.current)) {
          setError('Không tìm thấy phòng đang hoạt động. Hãy kiểm tra mã phòng.')
          void roomChannelRef.current?.unsubscribe()
          roomChannelRef.current = null
        }
        joinTimeoutRef.current = null
      }, 5000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể vào phòng.')
    }
  }

  const drawNumber = async () => {
    const current = roomRef.current
    const channel = roomChannelRef.current
    if (!current || !channel || current.hostId !== clientIdRef.current || current.finished) return
    const result = drawNextNumber(current)
    if (result.announcement) {
      setAnnouncement(result.announcement)
      const status = await channel.send({ type: 'broadcast', event: 'room-announcement', payload: result.announcement })
      if (status !== 'ok') setError('Không thể đồng bộ thông báo.')
    }
    await sendRoomState(result.room)
  }

  const resetRoom = async () => {
    const current = roomRef.current
    if (!current || current.hostId !== clientIdRef.current) return
    setAnnouncement('')
    setWinnerDialogOpen(false)
    await sendRoomState(makeRoomState(current.code, current.hostId, [], false, [], current.players))
  }

  const leaveRoom = async () => {
    const current = roomRef.current
    const channel = roomChannelRef.current
    if (current && channel) {
      if (current.hostId === clientIdRef.current) {
        const players = current.players.filter((player) => player.id !== clientIdRef.current)
        if (players.length) {
          await sendRoomState(makeRoomState(current.code, players[0].id, current.drawnNumbers, current.finished, current.winners, players))
        }
      } else {
        const status = await channel.send({
          type: 'broadcast',
          event: 'room-action',
          payload: { type: 'leave', playerId: clientIdRef.current },
        })
        if (status !== 'ok') setError('Không thể cập nhật danh sách người chơi trước khi rời phòng.')
      }
    }
    if (joinTimeoutRef.current !== null) window.clearTimeout(joinTimeoutRef.current)
    if (channel) await channel.unsubscribe()
    roomChannelRef.current = null
    roomRef.current = null
    setRoom(null)
    setError('')
    setAnnouncement('')
    setWinnerDialogOpen(false)
    finishedRef.current = false
  }

  const copyCode = async () => {
    if (!room) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(room.code)
      } else {
        const input = document.createElement('textarea')
        input.value = room.code
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.append(input)
        input.select()
        const success = document.execCommand('copy')
        input.remove()
        if (!success) throw new Error('Copy failed')
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Không sao chép được mã phòng. Hãy chọn và sao chép mã trực tiếp.')
    }
  }

  const currentNumber = room?.drawnNumbers.at(-1)
  const remaining = room ? room.maxNumber - room.drawnNumbers.length : 90
  const currentPlayer = room?.players.find((player) => player.id === clientId)
  const isHost = currentPlayer?.isHost ?? false

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" onClick={(event) => { event.preventDefault(); leaveRoom() }}>
          <span className="brand-mark"><Dices size={19} strokeWidth={2.2} /></span>
          <span>LOTT<span className="wordmark-o">O</span></span>
        </a>
        <div className="topbar-right">
          <span className={`connection ${connected ? 'is-connected' : ''}`}>
            <span className="connection-dot" />{connected ? 'Đang kết nối' : 'Đang nối lại'}
          </span>
          <span className="local-tag"><Wifi size={14} /> REALTIME ROOM</span>
        </div>
      </header>

      {!room ? (
        <section className="lobby">
          <div className="lobby-copy">
            <p className="eyebrow"><span /> BÀN QUAY SỐ TRỰC TIẾP</p>
            <h1>Mỗi lượt quay,<br /><em>cả phòng cùng chờ.</em></h1>
            <p className="lobby-description">Tạo một phòng riêng, gửi mã cho mọi người và bắt đầu quay số cùng nhau.</p>
            <div className="lobby-stats">
              <div><strong>01—90</strong><span>BỘ SỐ</span></div>
              <i />
              <div><strong>REAL TIME</strong><span>ĐỒNG BỘ TRỰC TIẾP</span></div>
            </div>
          </div>

          <div className="entry-panel">
            <div className="panel-heading">
              <span className="panel-index">01</span>
              <div><h2>Vào bàn chơi</h2><p>Bắt đầu bằng tên của bạn</p></div>
            </div>
            <label className="field-label" htmlFor="player-name">TÊN NGƯỜI CHƠI</label>
            <input id="player-name" maxLength={18} placeholder="Ví dụ: Minh Anh" value={playerName} onChange={(event) => setPlayerName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createRoom() }} />
            <button className="primary-button create-button" onClick={() => void createRoom()} disabled={!connected}>
              Tạo phòng mới <span>↗</span>
            </button>
            <div className="or-divider"><span />HOẶC<span /></div>
            <label className="field-label" htmlFor="room-code">MÃ PHÒNG</label>
            <div className="join-row">
              <input id="room-code" maxLength={6} placeholder="Nhập mã 6 ký tự" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/\s/g, ''))} onKeyDown={(event) => { if (event.key === 'Enter') void joinRoom() }} />
              <button className="join-button" aria-label="Vào phòng" onClick={() => void joinRoom()} disabled={!connected}><DoorOpen size={18} /></button>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <p className="local-note"><span /> Phòng đồng bộ trực tiếp qua internet</p>
          </div>
        </section>
      ) : (
        <section className="room-view">
          <div className="room-header">
            <button className="back-button" onClick={() => void leaveRoom()}><ArrowLeft size={17} /> Sảnh chờ</button>
            <div className="room-heading">
              <div><p className="eyebrow"><span /> PHÒNG ĐANG HOẠT ĐỘNG</p><h1>Bàn quay số</h1></div>
              <button className="room-code" onClick={copyCode} title="Sao chép mã phòng">
                <span>MÃ PHÒNG</span><strong>{room.code}</strong>{copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          {announcement && <div className={`room-announcement ${announcement.includes('đã KINH') ? 'announcement-kinh' : ''}`} role="status"><Dices size={17} /><span>{announcement}</span></div>}

          {room.finished && room.winners.length > 0 && <div className="winner-banner" role="status">
            <span className="winner-icon"><Trophy size={20} /></span>
            <div className="winner-copy">
              <p>VÁN ĐÃ DỪNG</p>
              <strong>{room.winners.map((winner) => winner.name).join(', ')}</strong>
              <span>{room.winners.map((winner) => `Vé ${winner.ticketIndex + 1}, hàng ${winner.rowIndex + 1}`).join(' · ')}</span>
            </div>
            {isHost && <button className="new-round-button" onClick={() => void resetRoom()}><RotateCcw size={15} /> Ván mới</button>}
          </div>}

          {room.finished && room.winners.length > 0 && winnerDialogOpen && <div className="winner-overlay">
            <section className="winner-dialog" role="alertdialog" aria-modal="true" aria-labelledby="winner-dialog-title" aria-describedby="winner-dialog-details">
              <button className="winner-close" aria-label="Đóng thông báo" onClick={() => setWinnerDialogOpen(false)}><X size={18} /></button>
              <span className="winner-dialog-icon"><Trophy size={27} /></span>
              <p className="winner-dialog-eyebrow">TRÒ CHƠI ĐÃ KẾT THÚC</p>
              <h2 id="winner-dialog-title">{room.winners.length > 1 ? 'Đồng chiến thắng' : 'Người chiến thắng'}</h2>
              <strong className="winner-dialog-names">{room.winners.map((winner) => winner.name).join(', ')}</strong>
              <p id="winner-dialog-details" className="winner-dialog-details">Đã Kinh ở {room.winners.map((winner) => `vé ${winner.ticketIndex + 1}, hàng ${winner.rowIndex + 1}`).join('; ')}</p>
              {isHost ? <button className="new-round-button winner-next-round" onClick={() => void resetRoom()}><RotateCcw size={16} /> Ván mới</button> : <button className="new-round-button winner-next-round" onClick={() => setWinnerDialogOpen(false)}>Đóng</button>}
            </section>
          </div>}

          <div className="room-grid">
            <section className="draw-panel">
              <div className="draw-panel-top"><span>VÒNG QUAY {room.drawnNumbers.length.toString().padStart(2, '0')}</span><span>{remaining} SỐ CÒN LẠI</span></div>
              <div className={`number-stage ${currentNumber ? 'has-number' : ''}`}>
                <div className="stage-ring ring-one" /><div className="stage-ring ring-two" />
                <span className="latest-label">{currentNumber ? 'SỐ VỪA QUAY' : 'SẴN SÀNG'}</span>
                <strong className="drawn-number" key={currentNumber ?? 'empty'}>{currentNumber?.toString().padStart(2, '0') ?? '—'}</strong>
                <span className="stage-caption">{currentNumber ? `Lượt ${room.drawnNumbers.length}` : 'Chờ lượt quay đầu tiên'}</span>
              </div>
              {isHost ? (
                <div className="draw-actions">
                  <button className="primary-button draw-button" onClick={() => void drawNumber()} disabled={remaining === 0 || room.finished}><Dices size={19} />{room.finished ? 'Ván đã dừng' : remaining === 0 ? 'Đã hết số' : 'Quay số tiếp theo'}<span>↗</span></button>
                  {!room.finished && <button className="reset-button" onClick={() => void resetRoom()} disabled={room.drawnNumbers.length === 0} title="Đặt lại lượt quay"><RotateCcw size={17} /></button>}
                </div>
              ) : <p className="host-hint">Chủ phòng đang điều khiển lượt quay</p>}
              <div className="board-block">
                <div className="section-title board-title">
                  <h2>Vé lô tô của bạn</h2>
                  <span>45 số · 3 vé</span>
                </div>
                <div className="ticket-stack">
                  {currentPlayer?.ticket.map((ticket, ticketIndex) => (
                    <section className="ticket-sheet" key={ticketIndex}>
                      <div className="ticket-card" role="grid" aria-label={`Vé ${ticketIndex + 1}, 3 hàng, 9 cột`}>
                        {ticket.flatMap((row, rowIndex) => row.map((number, columnIndex) => {
                          const drawn = number !== null && room.drawnNumbers.includes(number)
                          return <span className={`ticket-cell ${number === null ? 'ticket-empty' : ''} ${drawn ? 'ticket-drawn' : ''} ${number === currentNumber ? 'ticket-current' : ''}`} role="gridcell" key={`${rowIndex}-${columnIndex}`} aria-label={number === null ? 'Ô trống' : `Số ${number}${drawn ? ', đã quay' : ''}`}>
                            {number?.toString().padStart(2, '0') ?? ''}
                          </span>
                        }))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
              <div className="history-block">
                <div className="section-title"><h2>Lịch sử quay</h2><span>{room.drawnNumbers.length} / {room.maxNumber}</span></div>
                {room.drawnNumbers.length ? <div className="number-history" role="list" aria-label="Các số đã quay, mới nhất trước">{[...room.drawnNumbers].reverse().map((number, index) => <span className={index === 0 ? 'history-latest' : ''} role="listitem" key={`${number}-${index}`}>{number.toString().padStart(2, '0')}</span>)}</div> : <p className="empty-history">Chưa có số nào được quay.</p>}
              </div>
            </section>

            <aside className="players-panel">
              <div className="section-title"><h2>Người chơi</h2><span className="player-count"><Users size={14} />{room.players.length}</span></div>
              <div className="player-list">{room.players.map((player, index) => <div className="player-row" key={player.id}><span className={`player-avatar avatar-${index % 4}`}>{player.name.slice(0, 1).toUpperCase()}</span><span className="player-name">{player.name}{player.id === clientId && <small>BẠN</small>}</span>{player.status && <span className={`player-status status-${player.status}`}>{player.status === 'kinh' ? 'KINH' : 'SẮP KINH'}</span>}{player.isHost && <span className="host-badge">CHỦ PHÒNG</span>}</div>)}</div>
              <div className="invite-note"><span className="invite-line" /><p>Chia sẻ mã phòng để mời<br />mọi người vào cùng chơi.</p><button onClick={copyCode}>{copied ? 'Đã sao chép' : 'Sao chép mã'} <Copy size={14} /></button></div>
              {error && <p className="form-error" role="alert">{error}</p>}
            </aside>
          </div>
        </section>
      )}
      <footer className="footer"><span>LOTT<span className="wordmark-o">O</span></span><span>ONLINE MULTIPLAYER · {currentYear}</span></footer>
    </main>
  )
}

export default App
