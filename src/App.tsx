import { useState, useEffect } from 'react'
import { Plus, Users, Trophy, LayoutDashboard, Trash2, Edit2, Phone, Calendar, Clock, MapPin, DollarSign, Share2 } from 'lucide-react'
import type { Athlete, Game, PlayerPosition, TeamConfig } from './types'
import { DEFAULT_POSITIONS } from './types'
import { supabase } from './lib/supabase'
import { toPng } from 'html-to-image'
import { useRef } from 'react'
import './index.css'

export default function App() {
  const [activeTab, setActiveTab] = useState<'athletes' | 'games' | 'dashboard' | 'agenda' | 'marketing'>('dashboard')
  const [modalTab, setModalTab] = useState<'squad' | 'summary'>('squad')
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [previewGameId, setPreviewGameId] = useState<string | null>(null)
  const [formation, setFormation] = useState<string>(() => {
    return localStorage.getItem('formation') || '4-4-2'
  })
  
  const [teamConfig, setTeamConfig] = useState<TeamConfig>(() => {
    const saved = localStorage.getItem('teamConfig')
    if (!saved) return { name: 'RealMatismo', pixKey: '' }
    try {
      const parsed = JSON.parse(saved)
      return {
        ...parsed,
        logoUrl: parsed.logoUrl || parsed.logo_url,
        logoBgType: parsed.logoBgType || parsed.logo_bg_type,
        managerPhone: parsed.managerPhone || parsed.manager_phone
      }
    } catch (e) {
      return { name: 'RealMatismo', pixKey: '' }
    }
  })

  const [athletes, setAthletes] = useState<Athlete[]>(() => {
    const saved = localStorage.getItem('athletes')
    return saved ? JSON.parse(saved) : []
  })
  
  const [games, setGames] = useState<Game[]>(() => {
    const saved = localStorage.getItem('games')
    if (!saved) return []
    try {
      const parsed = JSON.parse(saved)
      return parsed.map((g: any) => ({
        ...g,
        opponentLogo: g.opponentLogo || g.opponent_logo,
        opponentLogoBg: g.opponentLogoBg || g.opponent_logo_bg,
        squad: g.squad || []
      }))
    } catch (e) {
      return []
    }
  })

  const [positions, setPositions] = useState<string[]>(() => {
    const saved = localStorage.getItem('positions')
    return saved ? JSON.parse(saved) : [...DEFAULT_POSITIONS]
  })

  const [isAddingPosition, setIsAddingPosition] = useState(false)
  const [newPositionName, setNewPositionName] = useState('')
  const artRef = useRef<HTMLDivElement>(null)

  const [isAddingAthlete, setIsAddingAthlete] = useState(false)
  const [isAddingGame, setIsAddingGame] = useState(false)

  const [newAthlete, setNewAthlete] = useState<Partial<Athlete>>({
    name: '',
    position: 'Meio-campo',
    phone: ''
  })

  const [newGame, setNewGame] = useState<Partial<Game>>({
    opponent: '',
    date: '',
    time: '',
    location: '',
    fee: 30
  })

  useEffect(() => {
    localStorage.setItem('athletes', JSON.stringify(athletes))
    if (supabase) {
      // Sync athletes to Supabase (simplistic implementation for now)
      // In a real app, we'd use proper hooks or service layer
    }
  }, [athletes])

  useEffect(() => {
    localStorage.setItem('games', JSON.stringify(games))
  }, [games])

  useEffect(() => {
    localStorage.setItem('teamConfig', JSON.stringify(teamConfig))
    if (supabase) {
      supabase.from('team_config').upsert({
        id: 1,
        name: teamConfig.name,
        logo_url: teamConfig.logoUrl,
        logo_bg_type: teamConfig.logoBgType,
        pix_key: teamConfig.pixKey,
        manager_phone: teamConfig.managerPhone
      }).then();
    }
  }, [teamConfig])

  useEffect(() => {
    localStorage.setItem('positions', JSON.stringify(positions))
  }, [positions])

  useEffect(() => {
    localStorage.setItem('formation', formation)
  }, [formation])

  // Initial fetch from Supabase if available
  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) return;

      const { data: athletesData } = await supabase.from('athletes').select('*');
      if (athletesData) setAthletes(athletesData);

      const { data: gamesData } = await supabase.from('games').select('*, squad:squad_entries(*)');
      if (gamesData) {
        setGames(gamesData.map(g => ({
          id: g.id,
          opponent: g.opponent,
          opponentLogo: g.opponent_logo,
          opponentLogoBg: g.opponent_logo_bg,
          date: g.date,
          time: g.time,
          location: g.location,
          fee: g.fee,
          scoreHome: g.score_home,
          scoreAway: g.score_away,
          matchReport: g.match_report,
          squad: g.squad.map((s: any) => ({ athleteId: s.athlete_id, paid: s.paid }))
        })));
      }

      const { data: positionsData } = await supabase.from('positions').select('name');
      if (positionsData && positionsData.length > 0) {
        setPositions(positionsData.map(p => p.name));
      }

      const { data: configData } = await supabase.from('team_config').select('*').single();
      if (configData) {
        setTeamConfig({
          name: configData.name,
          logoUrl: configData.logo_url,
          logoBgType: configData.logo_bg_type as 'dark' | 'light',
          pixKey: configData.pix_key,
          managerPhone: configData.manager_phone
        });
      }
    };

    fetchData();
  }, []);

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
  }

  const getBlendMode = (bgType?: 'dark' | 'light') => {
    return bgType === 'light' ? 'multiply' as const : 'screen' as const
  }

  const handleAddAthlete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAthlete.name || !newAthlete.phone) return

    const athlete: Athlete = {
      id: newAthlete.id || crypto.randomUUID(),
      name: newAthlete.name,
      position: newAthlete.position as PlayerPosition,
      phone: newAthlete.phone
    }

    if (newAthlete.id) {
      setAthletes(athletes.map(a => a.id === newAthlete.id ? athlete : a))
    } else {
      setAthletes([...athletes, athlete])
    }
    
    if (supabase) {
      await supabase.from('athletes').upsert({
        id: athlete.id,
        name: athlete.name,
        position: athlete.position,
        phone: athlete.phone
      })
    }

    setNewAthlete({ name: '', position: 'Meio-campo', phone: '' })
    setIsAddingAthlete(false)
  }

  const handleEditAthlete = (athlete: Athlete) => {
    setNewAthlete(athlete)
    setIsAddingAthlete(true)
  }

  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPositionName || positions.includes(newPositionName)) return

    const updatedPositions = [...positions, newPositionName]
    setPositions(updatedPositions)
    
    if (supabase) {
      await supabase.from('positions').insert({ name: newPositionName })
    }

    setNewPositionName('')
    setIsAddingPosition(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        callback(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleEditGame = (game: Game) => {
    setNewGame(game)
    setIsAddingGame(true)
  }

  const handleAddGame = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGame.opponent || !newGame.date) return

    const game: Game = {
      id: newGame.id || crypto.randomUUID(),
      opponent: newGame.opponent,
      opponentLogo: newGame.opponentLogo || '',
      opponentLogoBg: newGame.opponentLogoBg || 'dark',
      date: newGame.date,
      time: newGame.time || '',
      location: newGame.location || '',
      fee: newGame.fee || 30,
      squad: newGame.squad || [],
      scoreHome: newGame.scoreHome,
      scoreAway: newGame.scoreAway,
      matchReport: newGame.matchReport
    }

    if (newGame.id) {
      setGames(games.map(g => g.id === newGame.id ? game : g))
    } else {
      setGames([...games, game])
    }

    if (supabase) {
      await supabase.from('games').upsert({
        id: game.id,
        opponent: game.opponent,
        opponent_logo: game.opponentLogo,
        opponent_logo_bg: game.opponentLogoBg,
        date: game.date,
        time: game.time,
        location: game.location,
        fee: game.fee,
        score_home: game.scoreHome,
        score_away: game.scoreAway,
        match_report: game.matchReport
      })
    }

    setNewGame({ opponent: '', opponentLogo: '', opponentLogoBg: 'dark', date: '', time: '', location: '', fee: 30 })
    setIsAddingGame(false)
  }

  const handleUpdateGameSummary = async (gameId: string, scoreHome: number, scoreAway: number, matchReport: string) => {
    setGames(games.map(g => g.id === gameId ? { ...g, scoreHome, scoreAway, matchReport } : g));
    if (supabase) {
      await supabase.from('games').update({
        score_home: scoreHome,
        score_away: scoreAway,
        match_report: matchReport
      }).eq('id', gameId);
    }
  }

  const handleAvailability = async (athlete: Athlete, game: Game, available: boolean) => {
    if (!available) {
      // Se não estiver no squad, não faz nada (já está fora)
      const isInSquad = game.squad.find(s => s.athleteId === athlete.id);
      if (isInSquad) {
        toggleAthleteInSquad(game.id, athlete.id);
      }
      
      // Enviar mensagem de WhatsApp para o responsável
      const message = `Aviso: O atleta ${athlete.name} não poderá comparecer ao jogo contra ${game.opponent} no dia ${formatDate(game.date)}.`;
      const phone = teamConfig.managerPhone || '';
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
    } else {
      // Se disponível, garante que está no squad
      const isInSquad = game.squad.find(s => s.athleteId === athlete.id);
      if (!isInSquad) {
        toggleAthleteInSquad(game.id, athlete.id);
      }
    }
  }

  const toggleAthleteInSquad = async (gameId: string, athleteId: string) => {
    const game = games.find(g => g.id === gameId);
    if (!game) return;

    const isInSquad = game.squad.find(s => s.athleteId === athleteId);
    
    setGames(games.map(g => {
      if (g.id !== gameId) return g
      
      if (isInSquad) {
        return { ...g, squad: g.squad.filter(s => s.athleteId !== athleteId) }
      } else {
        return { ...g, squad: [...g.squad, { athleteId, paid: false }] }
      }
    }))

    if (supabase) {
      if (isInSquad) {
        await supabase.from('squad_entries').delete().eq('game_id', gameId).eq('athlete_id', athleteId)
      } else {
        await supabase.from('squad_entries').insert({ game_id: gameId, athlete_id: athleteId, paid: false })
      }
    }
  }

  const togglePaymentStatus = async (gameId: string, athleteId: string) => {
    const game = games.find(g => g.id === gameId);
    if (!game) return;
    const entry = game.squad.find(s => s.athleteId === athleteId);
    if (!entry) return;

    setGames(games.map(game => {
      if (game.id !== gameId) return game
      return {
        ...game,
        squad: game.squad.map(s => s.athleteId === athleteId ? { ...s, paid: !s.paid } : s)
      }
    }))

    if (supabase) {
      await supabase.from('squad_entries').update({ paid: !entry.paid }).eq('game_id', gameId).eq('athlete_id', athleteId)
    }
  }

  const generateWhatsAppText = (gameId: string) => {
    const game = games.find(g => g.id === gameId)
    if (!game) return ''

    let text = `*LISTA DE CONVOCAÇÃO PARA JOGO AMISTOSO MASTER*\n\n`
    text += `*PARTIDA:* ${teamConfig.name.toUpperCase()} vs ${game.opponent.toUpperCase()}\n`
    text += `*DATA:* ${formatDate(game.date)}\n`
    if (game.time) text += `*HORA:* ${game.time}h\n`
    if (game.location) text += `*LOCAL:* ${game.location}\n`
    text += `*TAXA:* R$ ${game.fee}\n\n`

    if (teamConfig.pixKey) {
      text += `*PIX PARA PAGAMENTO:* ${teamConfig.pixKey}\n\n`
    }
    
    text += `*LISTA DE ATLETAS:*\n`
    game.squad.forEach((s, index) => {
      const athlete = athletes.find(a => a.id === s.athleteId)
      if (athlete) {
        text += `${index + 1}. ${athlete.name} - ${athlete.position} (${s.paid ? 'PAGO' : 'PENDENTE'})\n`
      }
    })

    const totalArrecadado = game.squad.filter(s => s.paid).length * game.fee
    text += `\n*TOTAL ARRECADADO:* R$ ${totalArrecadado}\n`
    text += `\n_Gerado por ${teamConfig.name}_`

    const encodedText = encodeURIComponent(text)
    window.open(`https://wa.me/?text=${encodedText}`, '_blank')
  }

  const handleShareArt = async () => {
    if (artRef.current === null) return
    
    try {
      const dataUrl = await toPng(artRef.current, { cacheBust: true, pixelRatio: 2 })
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], `jogo-${new Date().getTime()}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Divulgação do Jogo',
          text: `Confira o nosso próximo jogo! ⚽🔥`
        });
      } else {
        // Fallback for desktop or unsupported browsers
        const link = document.createElement('a')
        link.download = `jogo-${new Date().getTime()}.png`
        link.href = dataUrl
        link.click()
        alert('Imagem baixada! Agora você pode compartilhar manualmente no WhatsApp.')
      }
    } catch (err) {
      console.error('Error sharing image:', err)
      if (err instanceof Error && err.name !== 'AbortError') {
        alert('Erro ao processar imagem. Tente novamente.')
      }
    }
  }

  const handleDownloadArt = async () => {
    if (artRef.current === null) return
    
    try {
      const dataUrl = await toPng(artRef.current, { cacheBust: true, pixelRatio: 2 })
      const link = document.createElement('a')
      link.download = `jogo-${new Date().getTime()}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Error downloading image:', err)
      alert('Erro ao baixar imagem. Tente novamente.')
    }
  }

  const shareIndividualPix = (athlete: Athlete, game: Game) => {
    let text = `Olá *${athlete.name}*!\n\n`
    text += `Você foi convocado para o jogo do *${teamConfig.name}* contra o *${game.opponent}*.\n`
    text += `DATA: ${formatDate(game.date)}\n`
    text += `LOCAL: ${game.location}\n`
    text += `TAXA: R$ ${game.fee}\n\n`
    
    if (teamConfig.pixKey) {
      text += `Para confirmar sua vaga, por favor realize o PIX:\n`
      text += `CHAVE: *${teamConfig.pixKey}*\n`
      text += `VALOR: *R$ ${game.fee}*\n\n`
    }
    
    text += `Por favor, envie o comprovante para confirmar!`
    
    const encodedText = encodeURIComponent(text)
    const phone = athlete.phone.replace(/\D/g, '')
    window.open(`https://wa.me/${phone}?text=${encodedText}`, '_blank')
  }

  const deleteAthlete = async (id: string) => {
    if (confirm('Tem certeza que deseja remover este atleta?')) {
      setAthletes(athletes.filter(a => a.id !== id))
      if (supabase) {
        await supabase.from('athletes').delete().eq('id', id)
      }
    }
  }

  const deleteGame = async (id: string) => {
    if (confirm('Tem certeza que deseja remover este jogo?')) {
      setGames(games.filter(g => g.id !== id))
      if (supabase) {
        await supabase.from('games').delete().eq('id', id)
      }
    }
  }

  return (
    <div className="flex flex-mobile-column" style={{ minHeight: '100vh' }}>
      {/* Sidebar Desktop */}
      <aside className="sidebar-desktop" style={{ 
        width: '280px', 
        backgroundColor: 'var(--surface)', 
        borderRight: '1px solid var(--border)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px'
      }}>
        <div className="flex items-center gap-3" style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '10px' }}>
          <div style={{ 
            width: '60px', 
            height: '60px', 
            backgroundColor: teamConfig.logoUrl ? 'transparent' : 'var(--primary)', 
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#000',
            overflow: 'hidden',
            boxShadow: teamConfig.logoUrl ? 'none' : '0 4px 12px rgba(46, 204, 113, 0.2)'
          }}>
            {teamConfig.logoUrl ? (
              <img 
                src={teamConfig.logoUrl} 
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'contain', 
                  mixBlendMode: getBlendMode(teamConfig.logoBgType)
                }} 
              />
            ) : (
              <Trophy size={32} />
            )}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', letterSpacing: '-0.02em', color: '#fff' }}>{teamConfig.name}</h2>
            <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Master Futebol</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-muted)' }}>CHAVE PIX</label>
            <input 
              type="text" 
              value={teamConfig.pixKey}
              onChange={e => setTeamConfig({...teamConfig, pixKey: e.target.value})}
              placeholder="E-mail ou CPF"
              style={{ fontSize: '0.875rem', padding: '8px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-muted)' }}>WHATSAPP DO RESPONSÁVEL</label>
            <input 
              type="text" 
              value={teamConfig.managerPhone || ''}
              onChange={e => setTeamConfig({...teamConfig, managerPhone: e.target.value})}
              placeholder="Ex: 5511999999999"
              style={{ fontSize: '0.875rem', padding: '8px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-muted)' }}>ESCUDO DO TIME</label>
            <div className="flex items-center gap-3">
              <div style={{ width: '48px', height: '48px', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {teamConfig.logoUrl ? (
                  <img src={teamConfig.logoUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <Trophy size={20} opacity={0.3} />
                )}
              </div>
              <input 
                type="file" 
                accept="image/*"
                onChange={e => handleFileChange(e, (base64) => setTeamConfig({...teamConfig, logoUrl: base64}))}
                style={{ fontSize: '0.75rem' }}
              />
            </div>
            <div className="flex gap-2" style={{ marginTop: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', cursor: 'pointer', color: teamConfig.logoBgType !== 'light' ? 'var(--primary)' : 'var(--text-muted)' }}>
                <input type="radio" name="teamLogoBg" checked={teamConfig.logoBgType !== 'light'} onChange={() => setTeamConfig({...teamConfig, logoBgType: 'dark'})} style={{ width: '12px', height: '12px' }} />
                Fundo Escuro
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', cursor: 'pointer', color: teamConfig.logoBgType === 'light' ? 'var(--primary)' : 'var(--text-muted)' }}>
                <input type="radio" name="teamLogoBg" checked={teamConfig.logoBgType === 'light'} onChange={() => setTeamConfig({...teamConfig, logoBgType: 'light'})} style={{ width: '12px', height: '12px' }} />
                Fundo Claro
              </label>
            </div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            <LayoutDashboard size={20} />
            Painel
          </button>
            <button 
            onClick={() => setActiveTab('agenda')}
            className={`flex items-center gap-2 nav-item ${activeTab === 'agenda' ? 'active' : ''}`}
          >
            <Calendar size={20} />
            Agenda
          </button>
          <button 
            onClick={() => setActiveTab('athletes')}
            className={`flex items-center gap-2 nav-item ${activeTab === 'athletes' ? 'active' : ''}`}
          >
            <Users size={20} />
            Atletas
          </button>
          <button 
            onClick={() => setActiveTab('marketing')}
            className={`flex items-center gap-2 nav-item ${activeTab === 'marketing' ? 'active' : ''}`}
          >
            <Share2 size={20} />
            Divulgação
          </button>
          <button 
            onClick={() => setActiveTab('games')}
            className={`flex items-center gap-2 nav-item ${activeTab === 'games' ? 'active' : ''}`}
          >
            <Trophy size={20} />
            Jogos
          </button>
        </nav>
      </aside>

      {/* Mobile Navigation */}
      <nav className="mobile-nav">
        <button onClick={() => setActiveTab('dashboard')} className={`mobile-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}>
          <LayoutDashboard size={20} />
          <span>Painel</span>
        </button>
        <button onClick={() => setActiveTab('agenda')} className={`mobile-nav-item ${activeTab === 'agenda' ? 'active' : ''}`}>
          <Calendar size={20} />
          <span>Agenda</span>
        </button>
        <button onClick={() => setActiveTab('athletes')} className={`mobile-nav-item ${activeTab === 'athletes' ? 'active' : ''}`}>
          <Users size={20} />
          <span>Atletas</span>
        </button>
        <button onClick={() => setActiveTab('marketing')} className={`mobile-nav-item ${activeTab === 'marketing' ? 'active' : ''}`}>
          <Share2 size={20} />
          <span>Marketing</span>
        </button>
        <button onClick={() => setActiveTab('games')} className={`mobile-nav-item ${activeTab === 'games' ? 'active' : ''}`}>
          <Trophy size={20} />
          <span>Jogos</span>
        </button>
      </nav>

      {/* Main Content */}
      <main className="container" style={{ flex: 1 }}>
        {activeTab === 'dashboard' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h1 style={{ marginBottom: '4px' }}>Painel Geral</h1>
              <p className="text-muted">Visão geral do seu time e finanças.</p>
            </div>

            <div className="athlete-grid dashboard-stats" style={{ marginBottom: '40px' }}>
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: 'rgba(46, 204, 113, 0.1)', color: 'var(--primary)' }}>
                  <Users size={32} />
                </div>
                <div>
                  <div className="text-muted">Total de Atletas</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{athletes.length}</div>
                </div>
              </div>

              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: 'rgba(241, 196, 15, 0.1)', color: 'var(--secondary)' }}>
                  <Trophy size={32} />
                </div>
                <div>
                  <div className="text-muted">Jogos Realizados</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{games.length}</div>
                </div>
              </div>

              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--success)' }}>
                  <DollarSign size={32} />
                </div>
                <div>
                  <div className="text-muted">Arrecadação Total</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                    R$ {
                      games.reduce((total, game) => {
                        const gameTotal = game.squad.filter(s => s.paid).length * game.fee;
                        return total + gameTotal;
                      }, 0)
                    }
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-mobile-column gap-4">
              <div className="card" style={{ flex: 1 }}>
                <h3 style={{ marginBottom: '20px' }}>Últimos Jogos</h3>
                {games.length === 0 ? (
                  <p className="text-muted">Nenhum jogo registrado.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {games.slice(-3).reverse().map(game => (
                      <div key={game.id} className="flex justify-between items-center p-3" style={{ backgroundColor: 'var(--surface-hover)', borderRadius: '8px' }}>
                        <div className="flex items-center gap-3">
                          <div style={{ width: '32px', height: '32px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {game.opponentLogo ? (
                              <img src={game.opponentLogo} style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: getBlendMode(game.opponentLogoBg) }} />
                            ) : (
                              <Trophy size={16} opacity={0.3} />
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: '600' }}>{teamConfig.name} vs {game.opponent}</div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>{formatDate(game.date)}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: 'var(--primary)', fontWeight: '600' }}>
                            R$ {game.squad.filter(s => s.paid).length * game.fee}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                            {game.squad.filter(s => s.paid).length} / {game.squad.length} pagos
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="card" style={{ flex: 1 }}>
                <h3 style={{ marginBottom: '20px' }}>Distribuição de Posições</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {positions.map(pos => {
                    const count = athletes.filter(a => a.position === pos).length;
                    const percentage = athletes.length > 0 ? (count / athletes.length) * 100 : 0;
                    
                    return (
                      <div key={pos}>
                        <div className="flex justify-between" style={{ marginBottom: '4px', fontSize: '0.875rem' }}>
                          <span>{pos}</span>
                          <span>{count}</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--surface-hover)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Arrecadação por Jogo */}
            <div className="flex flex-mobile-column gap-4" style={{ marginTop: '24px' }}>
              <div className="card" style={{ flex: 1 }}>
                <h3 style={{ marginBottom: '20px' }}>Arrecadação por Jogo</h3>
                {games.length === 0 ? (
                  <p className="text-muted">Nenhum dado financeiro disponível.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {games.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5).map(game => {
                      const collected = game.squad.filter(s => s.paid).length * game.fee;
                      const expected = game.squad.length * game.fee;
                      const pct = expected > 0 ? (collected / expected) * 100 : 0;
                      return (
                        <div key={game.id}>
                          <div className="flex justify-between items-center" style={{ marginBottom: '6px' }}>
                            <div className="flex items-center gap-2">
                              <div style={{ width: '24px', height: '24px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                {game.opponentLogo ? (
                                  <img src={game.opponentLogo} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                ) : (
                                  <Trophy size={12} opacity={0.3} />
                                )}
                              </div>
                              <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>vs {game.opponent}</span>
                              <span className="text-muted" style={{ fontSize: '0.7rem' }}>{formatDate(game.date)}</span>
                            </div>
                            <span style={{ color: 'var(--primary)', fontWeight: '700', fontSize: '0.9rem' }}>R$ {collected}</span>
                          </div>
                          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-hover)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.5s ease' }}></div>
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.7rem', marginTop: '2px' }}>
                            {game.squad.filter(s => s.paid).length} / {game.squad.length} pagos ({Math.round(pct)}%)
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Campo Tático - Próxima Convocação */}
              <div className="card" style={{ flex: 1 }}>
                <div className="flex justify-between items-center" style={{ marginBottom: '20px' }}>
                  <h3>Próxima Convocação Tática</h3>
                  <select
                    value={formation}
                    onChange={e => setFormation(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--surface-hover)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <option value="4-4-2">4-4-2</option>
                    <option value="4-3-3">4-3-3</option>
                    <option value="4-5-1">4-5-1</option>
                    <option value="4-2-3-1">4-2-3-1</option>
                    <option value="3-5-2">3-5-2</option>
                    <option value="3-4-3">3-4-3</option>
                    <option value="5-3-2">5-3-2</option>
                    <option value="5-4-1">5-4-1</option>
                  </select>
                </div>
                {(() => {
                  const nextGame = games
                    .filter(g => new Date(g.date + 'T' + (g.time || '23:59')) >= new Date())
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

                  if (!nextGame || nextGame.squad.length === 0) {
                    return <p className="text-muted">{!nextGame ? 'Nenhum jogo futuro agendado.' : 'Nenhum atleta convocado para o próximo jogo.'}</p>;
                  }

                  const squadIds = nextGame.squad.map(s => s.athleteId);
                  const squadAthletes = athletes.filter(a => squadIds.includes(a.id));

                  // Slot: x%, y%, preferred position, color
                  type Slot = { x: number; y: number; role: string; color: string };
                  const F: Record<string, Slot[]> = {
                    '4-4-2': [
                      { x: 35, y: 14, role: 'Atacante', color: '#f1c40f' }, { x: 65, y: 14, role: 'Atacante', color: '#f1c40f' },
                      { x: 10, y: 40, role: 'Meio-campo', color: '#3498db' }, { x: 37, y: 36, role: 'Meio-campo', color: '#3498db' },
                      { x: 63, y: 36, role: 'Cabeça de Area', color: '#3498db' }, { x: 90, y: 40, role: 'Meio-campo', color: '#3498db' },
                      { x: 10, y: 72, role: 'Lateral', color: '#e74c3c' }, { x: 37, y: 72, role: 'Zagueiro', color: '#e74c3c' },
                      { x: 63, y: 72, role: 'Zagueiro', color: '#e74c3c' }, { x: 90, y: 72, role: 'Lateral', color: '#e74c3c' },
                    ],
                    '4-3-3': [
                      { x: 15, y: 16, role: 'Atacante', color: '#f1c40f' }, { x: 50, y: 12, role: 'Atacante', color: '#f1c40f' }, { x: 85, y: 16, role: 'Atacante', color: '#f1c40f' },
                      { x: 30, y: 42, role: 'Meio-campo', color: '#3498db' }, { x: 50, y: 38, role: 'Cabeça de Area', color: '#3498db' }, { x: 70, y: 42, role: 'Meio-campo', color: '#3498db' },
                      { x: 10, y: 72, role: 'Lateral', color: '#e74c3c' }, { x: 37, y: 72, role: 'Zagueiro', color: '#e74c3c' },
                      { x: 63, y: 72, role: 'Zagueiro', color: '#e74c3c' }, { x: 90, y: 72, role: 'Lateral', color: '#e74c3c' },
                    ],
                    '4-5-1': [
                      { x: 50, y: 12, role: 'Atacante', color: '#f1c40f' },
                      { x: 10, y: 36, role: 'Meio-campo', color: '#3498db' }, { x: 30, y: 38, role: 'Meio-campo', color: '#3498db' },
                      { x: 50, y: 34, role: 'Cabeça de Area', color: '#3498db' }, { x: 70, y: 38, role: 'Meio-campo', color: '#3498db' }, { x: 90, y: 36, role: 'Meio-campo', color: '#3498db' },
                      { x: 10, y: 72, role: 'Lateral', color: '#e74c3c' }, { x: 37, y: 72, role: 'Zagueiro', color: '#e74c3c' },
                      { x: 63, y: 72, role: 'Zagueiro', color: '#e74c3c' }, { x: 90, y: 72, role: 'Lateral', color: '#e74c3c' },
                    ],
                    '4-2-3-1': [
                      { x: 50, y: 12, role: 'Atacante', color: '#f1c40f' },
                      { x: 15, y: 30, role: 'Meio-campo', color: '#3498db' }, { x: 50, y: 28, role: 'Meio-campo', color: '#3498db' }, { x: 85, y: 30, role: 'Meio-campo', color: '#3498db' },
                      { x: 37, y: 50, role: 'Cabeça de Area', color: '#9b59b6' }, { x: 63, y: 50, role: 'Cabeça de Area', color: '#9b59b6' },
                      { x: 10, y: 72, role: 'Lateral', color: '#e74c3c' }, { x: 37, y: 72, role: 'Zagueiro', color: '#e74c3c' },
                      { x: 63, y: 72, role: 'Zagueiro', color: '#e74c3c' }, { x: 90, y: 72, role: 'Lateral', color: '#e74c3c' },
                    ],
                    '3-5-2': [
                      { x: 35, y: 14, role: 'Atacante', color: '#f1c40f' }, { x: 65, y: 14, role: 'Atacante', color: '#f1c40f' },
                      { x: 10, y: 38, role: 'Lateral', color: '#3498db' }, { x: 30, y: 40, role: 'Meio-campo', color: '#3498db' },
                      { x: 50, y: 36, role: 'Cabeça de Area', color: '#3498db' }, { x: 70, y: 40, role: 'Meio-campo', color: '#3498db' }, { x: 90, y: 38, role: 'Lateral', color: '#3498db' },
                      { x: 25, y: 72, role: 'Zagueiro', color: '#e74c3c' }, { x: 50, y: 72, role: 'Zagueiro', color: '#e74c3c' }, { x: 75, y: 72, role: 'Zagueiro', color: '#e74c3c' },
                    ],
                    '3-4-3': [
                      { x: 15, y: 16, role: 'Atacante', color: '#f1c40f' }, { x: 50, y: 12, role: 'Atacante', color: '#f1c40f' }, { x: 85, y: 16, role: 'Atacante', color: '#f1c40f' },
                      { x: 10, y: 42, role: 'Lateral', color: '#3498db' }, { x: 37, y: 40, role: 'Meio-campo', color: '#3498db' },
                      { x: 63, y: 40, role: 'Cabeça de Area', color: '#3498db' }, { x: 90, y: 42, role: 'Lateral', color: '#3498db' },
                      { x: 25, y: 72, role: 'Zagueiro', color: '#e74c3c' }, { x: 50, y: 72, role: 'Zagueiro', color: '#e74c3c' }, { x: 75, y: 72, role: 'Zagueiro', color: '#e74c3c' },
                    ],
                    '5-3-2': [
                      { x: 35, y: 14, role: 'Atacante', color: '#f1c40f' }, { x: 65, y: 14, role: 'Atacante', color: '#f1c40f' },
                      { x: 30, y: 40, role: 'Meio-campo', color: '#3498db' }, { x: 50, y: 38, role: 'Cabeça de Area', color: '#3498db' }, { x: 70, y: 40, role: 'Meio-campo', color: '#3498db' },
                      { x: 8, y: 65, role: 'Lateral', color: '#e74c3c' }, { x: 30, y: 72, role: 'Zagueiro', color: '#e74c3c' },
                      { x: 50, y: 72, role: 'Zagueiro', color: '#e74c3c' }, { x: 70, y: 72, role: 'Zagueiro', color: '#e74c3c' }, { x: 92, y: 65, role: 'Lateral', color: '#e74c3c' },
                    ],
                    '5-4-1': [
                      { x: 50, y: 12, role: 'Atacante', color: '#f1c40f' },
                      { x: 10, y: 38, role: 'Meio-campo', color: '#3498db' }, { x: 37, y: 40, role: 'Meio-campo', color: '#3498db' },
                      { x: 63, y: 40, role: 'Cabeça de Area', color: '#3498db' }, { x: 90, y: 38, role: 'Meio-campo', color: '#3498db' },
                      { x: 8, y: 65, role: 'Lateral', color: '#e74c3c' }, { x: 30, y: 72, role: 'Zagueiro', color: '#e74c3c' },
                      { x: 50, y: 72, role: 'Zagueiro', color: '#e74c3c' }, { x: 70, y: 72, role: 'Zagueiro', color: '#e74c3c' }, { x: 92, y: 65, role: 'Lateral', color: '#e74c3c' },
                    ],
                  };

                  const slots = F[formation] || F['4-4-2'];
                  const gk = squadAthletes.filter(a => a.position === 'Goleiro');
                  const outfield = squadAthletes.filter(a => a.position !== 'Goleiro');

                  // Assign athletes to slots: exact match first, then fill remaining
                  const assigned: { athlete: typeof outfield[0]; slot: Slot }[] = [];
                  const usedSlots = new Set<number>();
                  const usedAthletes = new Set<string>();

                  // Pass 1: exact position match
                  for (const a of outfield) {
                    for (let i = 0; i < slots.length; i++) {
                      if (!usedSlots.has(i) && !usedAthletes.has(a.id) && slots[i].role === a.position) {
                        assigned.push({ athlete: a, slot: slots[i] });
                        usedSlots.add(i);
                        usedAthletes.add(a.id);
                        break;
                      }
                    }
                  }
                  // Pass 2: remaining athletes to remaining slots
                  for (const a of outfield) {
                    if (usedAthletes.has(a.id)) continue;
                    for (let i = 0; i < slots.length; i++) {
                      if (!usedSlots.has(i)) {
                        assigned.push({ athlete: a, slot: slots[i] });
                        usedSlots.add(i);
                        usedAthletes.add(a.id);
                        break;
                      }
                    }
                  }

                  const renderPlayer = (a: typeof outfield[0], color: string, x: number, y: number) => (
                    <div key={a.id} style={{
                      position: 'absolute', left: `${x}%`, top: `${y}%`,
                      transform: 'translate(-50%, -50%)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                      transition: 'all 0.5s ease'
                    }}>
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '50%',
                        backgroundColor: color, color: color === '#f1c40f' ? '#000' : 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: '0.75rem', border: '2px solid white',
                        boxShadow: '0 3px 8px rgba(0,0,0,0.5)'
                      }}>{a.name.charAt(0)}</div>
                      <span style={{
                        fontSize: '0.55rem', fontWeight: 700, color: 'white',
                        textShadow: '1px 1px 3px rgba(0,0,0,0.9)', whiteSpace: 'nowrap',
                        maxWidth: '55px', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}>{a.name.split(' ')[0]}</span>
                    </div>
                  );

                  return (
                    <div>
                      <div style={{ textAlign: 'center', marginBottom: '12px', fontSize: '0.85rem', fontWeight: '700', color: 'var(--primary)' }}>
                        vs {nextGame.opponent} — {formatDate(nextGame.date)}
                      </div>
                      <div style={{
                        position: 'relative', width: '100%', aspectRatio: '3/4',
                        background: 'linear-gradient(180deg, #1a6b1a 0%, #228B22 50%, #2d8a2d 100%)',
                        border: '3px solid rgba(255,255,255,0.6)', borderRadius: '12px', overflow: 'hidden'
                      }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, border: '2px solid rgba(255,255,255,0.35)', margin: '8px', pointerEvents: 'none' }}></div>
                        <div style={{ position: 'absolute', top: '50%', left: '8px', right: '8px', height: '1px', backgroundColor: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}></div>
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '60px', height: '60px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '50%', pointerEvents: 'none' }}></div>
                        <div style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', width: '40%', height: '12%', border: '1px solid rgba(255,255,255,0.35)', borderTop: 'none', pointerEvents: 'none' }}></div>
                        <div style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', width: '40%', height: '12%', border: '1px solid rgba(255,255,255,0.35)', borderBottom: 'none', pointerEvents: 'none' }}></div>

                        {assigned.map(({ athlete, slot }) => renderPlayer(athlete, slot.color, slot.x, slot.y))}
                        {gk.map(a => renderPlayer(a, '#f39c12', 50, 89))}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
                        <div className="flex items-center gap-1"><div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f1c40f' }}></div><span style={{ fontSize: '0.65rem' }}>Atacante</span></div>
                        <div className="flex items-center gap-1"><div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#3498db' }}></div><span style={{ fontSize: '0.65rem' }}>Meio</span></div>
                        <div className="flex items-center gap-1"><div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#e74c3c' }}></div><span style={{ fontSize: '0.65rem' }}>Defesa</span></div>
                        <div className="flex items-center gap-1"><div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f39c12' }}></div><span style={{ fontSize: '0.65rem' }}>Goleiro</span></div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'athletes' && (
          <div>
            <div className="flex flex-mobile-column justify-between items-center gap-4" style={{ marginBottom: '32px' }}>
              <div>
                <h1 style={{ marginBottom: '4px' }}>Gestão de Atletas</h1>
                <p className="text-muted">Cadastre e gerencie os jogadores do seu time.</p>
              </div>
              <button 
                className="btn-primary flex items-center gap-2"
                onClick={() => {
                  setNewAthlete({ name: '', position: 'Meio-campo', phone: '' });
                  setIsAddingAthlete(true);
                }}
              >
                <Plus size={20} />
                Novo Atleta
              </button>
            </div>

            {athletes.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <Users size={48} className="text-muted" style={{ marginBottom: '16px' }} />
                <h3>Nenhum atleta cadastrado</h3>
                <p className="text-muted">Comece adicionando os jogadores ao seu elenco.</p>
              </div>
            ) : (
              <div className="athlete-grid">
                {athletes.map(athlete => (
                  <div key={athlete.id} className="card athlete-card">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="badge">{athlete.position}</span>
                        <h3 style={{ marginTop: '12px', marginBottom: '4px' }}>{athlete.name}</h3>
                        <div className="flex items-center gap-2 text-muted">
                          <Phone size={14} />
                          <span>{athlete.phone}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => handleEditAthlete(athlete)}
                          style={{ color: 'var(--primary)', padding: '8px', background: 'transparent' }}
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => deleteAthlete(athlete.id)}
                          style={{ color: 'var(--danger)', padding: '8px', background: 'transparent' }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'games' && (
          <div>
            <div className="flex flex-mobile-column justify-between items-center gap-4" style={{ marginBottom: '32px' }}>
              <div>
                <h1 style={{ marginBottom: '4px' }}>Gestão de Jogos</h1>
                <p className="text-muted">Marque partidas e gerencie as convocações.</p>
              </div>
              <button 
                className="btn-primary flex items-center gap-2"
                onClick={() => {
                  setNewGame({ opponent: '', opponentLogo: '', opponentLogoBg: 'dark', date: '', time: '', location: '', fee: 30 });
                  setIsAddingGame(true);
                }}
              >
                <Plus size={20} />
                Novo Jogo
              </button>
            </div>

            {games.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <Calendar size={48} className="text-muted" style={{ marginBottom: '16px' }} />
                <h3>Nenhum jogo agendado</h3>
                <p className="text-muted">Crie seu primeiro jogo para começar as convocações.</p>
              </div>
            ) : (
              <div className="athlete-grid">
                {games.map(game => (
                  <div key={game.id} className="card">
                    <div className="flex justify-between items-start">
                      <div style={{ flex: 1 }}>
                        <div className="flex items-center gap-2" style={{ marginBottom: '12px' }}>
                          <div style={{ width: '40px', height: '40px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyItems: 'center' }}>
                            {game.opponentLogo ? (
                              <img src={game.opponentLogo} alt={game.opponent} style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: getBlendMode(game.opponentLogoBg) }} />
                            ) : (
                              <Trophy size={20} style={{ margin: 'auto', opacity: 0.3 }} />
                            )}
                          </div>
                          <h3 style={{ margin: 0 }}>{game.opponent}</h3>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div className="flex items-center gap-2 text-muted">
                            <Calendar size={14} />
                            <span>{formatDate(game.date)}</span>
                          </div>
                          {game.time && (
                            <div className="flex items-center gap-2 text-muted">
                              <Clock size={14} />
                              <span>{game.time}h</span>
                            </div>
                          )}
                          {game.location && (
                            <div className="flex items-center gap-2 text-muted">
                              <MapPin size={14} />
                              <span>{game.location}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2" style={{ color: 'var(--primary)', fontWeight: '600', marginTop: '4px' }}>
                            <DollarSign size={14} />
                            <span>R$ {game.fee}/pessoa</span>
                          </div>
                        </div>

                        <div style={{ marginTop: '20px' }}>
                          <button 
                            className="btn-secondary" 
                            style={{ width: '100%', fontSize: '0.875rem' }}
                            onClick={() => setSelectedGameId(game.id)}
                          >
                            Ver Convocação ({game.squad.length})
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => handleEditGame(game)}
                          style={{ color: 'var(--primary)', padding: '8px', background: 'transparent' }}
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => deleteGame(game.id)}
                          style={{ color: 'var(--danger)', padding: '8px', background: 'transparent' }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modal Novo Atleta */}
        {isAddingAthlete && (
          <div className="modal-overlay">
            <div className="modal-content card" style={{ width: '100%', maxWidth: '400px' }}>
              <h2>{newAthlete.id ? 'Editar Atleta' : 'Novo Atleta'}</h2>
              <form onSubmit={handleAddAthlete} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem' }}>Nome Completo</label>
                  <input 
                    type="text" 
                    value={newAthlete.name}
                    onChange={e => setNewAthlete({...newAthlete, name: e.target.value})}
                    placeholder="Ex: Neymar Jr"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.875rem' }}>
                    Posição
                    <button 
                      type="button" 
                      onClick={() => setIsAddingPosition(true)}
                      style={{ fontSize: '0.7rem', color: 'var(--primary)', background: 'transparent', padding: '2px 4px', border: '1px solid var(--primary)', borderRadius: '4px' }}
                    >
                      + Nova
                    </button>
                  </label>
                  <select 
                    value={newAthlete.position}
                    onChange={e => setNewAthlete({...newAthlete, position: e.target.value as PlayerPosition})}
                  >
                    {positions.map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem' }}>WhatsApp</label>
                  <input 
                    type="tel" 
                    value={newAthlete.phone}
                    onChange={e => setNewAthlete({...newAthlete, phone: e.target.value})}
                    placeholder="(00) 00000-0000"
                    required
                  />
                </div>
                <div className="flex gap-2" style={{ marginTop: '8px' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ flex: 1 }}
                    onClick={() => setIsAddingAthlete(false)}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                    Salvar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Nova Posição */}
        {isAddingPosition && (
          <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="modal-content card" style={{ width: '100%', maxWidth: '300px' }}>
              <h2>Nova Posição</h2>
              <form onSubmit={handleAddPosition} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem' }}>Nome da Posição</label>
                  <input 
                    type="text" 
                    value={newPositionName}
                    onChange={e => setNewPositionName(e.target.value)}
                    placeholder="Ex: Volante"
                    autoFocus
                    required
                  />
                </div>
                <div className="flex gap-2" style={{ marginTop: '8px' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ flex: 1 }}
                    onClick={() => setIsAddingPosition(false)}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                    Adicionar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Novo Jogo */}
        {isAddingGame && (
          <div className="modal-overlay">
            {/* same content as before */}
            <div className="modal-content card" style={{ width: '100%', maxWidth: '450px' }}>
              <h2>{newGame.id ? 'Editar Jogo' : 'Novo Jogo'}</h2>
              <form onSubmit={handleAddGame} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem' }}>Adversário</label>
                  <input 
                    type="text" 
                    value={newGame.opponent}
                    onChange={e => setNewGame({...newGame, opponent: e.target.value})}
                    placeholder="Nome do time adversário"
                    required
                  />
                </div>
                
                <div className="flex gap-4">
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem' }}>Data</label>
                    <input 
                      type="date" 
                      value={newGame.date}
                      onChange={e => setNewGame({...newGame, date: e.target.value})}
                      required
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem' }}>Horário</label>
                    <input 
                      type="time" 
                      value={newGame.time}
                      onChange={e => setNewGame({...newGame, time: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem' }}>Local</label>
                  <input 
                    type="text" 
                    value={newGame.location}
                    onChange={e => setNewGame({...newGame, location: e.target.value})}
                    placeholder="Nome da quadra/estádio"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem' }}>Valor por Atleta (R$)</label>
                  <input 
                    type="number" 
                    value={newGame.fee}
                    onChange={e => setNewGame({...newGame, fee: Number(e.target.value)})}
                    placeholder="30"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem' }}>Escudo do Adversário</label>
                  <div className="flex items-center gap-3">
                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {newGame.opponentLogo ? (
                        <img src={newGame.opponentLogo} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <Trophy size={16} opacity={0.3} />
                      )}
                    </div>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={e => handleFileChange(e, (base64) => setNewGame({...newGame, opponentLogo: base64}))}
                      style={{ fontSize: '0.75rem' }}
                    />
                  </div>
                  <div className="flex gap-2" style={{ marginTop: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', cursor: 'pointer', color: newGame.opponentLogoBg !== 'light' ? 'var(--primary)' : 'var(--text-muted)' }}>
                      <input type="radio" name="opponentLogoBg" checked={newGame.opponentLogoBg !== 'light'} onChange={() => setNewGame({...newGame, opponentLogoBg: 'dark'})} style={{ width: '12px', height: '12px' }} />
                      Fundo Escuro
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', cursor: 'pointer', color: newGame.opponentLogoBg === 'light' ? 'var(--primary)' : 'var(--text-muted)' }}>
                      <input type="radio" name="opponentLogoBg" checked={newGame.opponentLogoBg === 'light'} onChange={() => setNewGame({...newGame, opponentLogoBg: 'light'})} style={{ width: '12px', height: '12px' }} />
                      Fundo Claro
                    </label>
                  </div>
                </div>

                <div className="flex gap-2" style={{ marginTop: '8px' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ flex: 1 }}
                    onClick={() => setIsAddingGame(false)}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                    {newGame.id ? 'Salvar Alterações' : 'Agendar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Convocação */}
        {selectedGameId && (
          (() => {
            const game = games.find(g => g.id === selectedGameId)!;
            return (
              <div className="modal-overlay">
                <div className="modal-content card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div className="flex flex-mobile-column justify-between items-center gap-4" style={{ marginBottom: '20px' }}>
                    <div className="flex items-center gap-3">
                      <h2 style={{ margin: 0 }}>Detalhes do Jogo</h2>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setModalTab('squad')}
                          className={`btn-secondary ${modalTab === 'squad' ? 'active' : ''}`}
                          style={{ padding: '6px 12px', fontSize: '0.875rem', backgroundColor: modalTab === 'squad' ? 'var(--primary)' : 'transparent', color: modalTab === 'squad' ? 'white' : 'var(--text-muted)' }}
                        >
                          Convocação
                        </button>
                        <button 
                          onClick={() => setModalTab('summary')}
                          className={`btn-secondary ${modalTab === 'summary' ? 'active' : ''}`}
                          style={{ padding: '6px 12px', fontSize: '0.875rem', backgroundColor: modalTab === 'summary' ? 'var(--primary)' : 'transparent', color: modalTab === 'summary' ? 'white' : 'var(--text-muted)' }}
                        >
                          Súmula
                        </button>
                      </div>
                    </div>
                    <button onClick={() => setSelectedGameId(null)} className="btn-secondary" style={{ padding: '8px 12px' }}>Fechar</button>
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1, paddingRight: '10px' }}>
                    {modalTab === 'squad' ? (
                      <>
                        <div className="flex justify-between items-center" style={{ marginBottom: '16px' }}>
                          <h4 style={{ margin: 0 }}>Selecione os Atletas</h4>
                          <button 
                            onClick={() => generateWhatsAppText(selectedGameId)}
                            className="btn-primary flex items-center gap-2"
                            style={{ padding: '6px 12px', fontSize: '0.875rem' }}
                          >
                            <Share2 size={16} />
                            WhatsApp
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {athletes.map(athlete => {
                            const squadMember = game.squad.find(s => s.athleteId === athlete.id);
                            const isInSquad = !!squadMember;
                            
                            return (
                              <div key={athlete.id} className="flex items-center justify-between p-3" style={{ 
                                backgroundColor: isInSquad ? 'rgba(46, 204, 113, 0.05)' : 'var(--surface-hover)',
                                borderRadius: '8px',
                                border: isInSquad ? '1px solid var(--primary)' : '1px solid transparent'
                              }}>
                                <div className="flex items-center gap-3">
                                  <input 
                                    type="checkbox" 
                                    checked={isInSquad}
                                    onChange={() => toggleAthleteInSquad(selectedGameId, athlete.id)}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                  />
                                  <div>
                                    <div style={{ fontWeight: '600' }}>{athlete.name}</div>
                                    <div className="flex items-center gap-2" style={{ marginTop: '4px' }}>
                                      <button 
                                        onClick={() => handleAvailability(athlete, game, true)}
                                        style={{ 
                                          fontSize: '0.65rem', 
                                          padding: '2px 8px', 
                                          borderRadius: '4px', 
                                          backgroundColor: isInSquad ? 'rgba(46, 204, 113, 0.2)' : 'rgba(255,255,255,0.05)',
                                          color: isInSquad ? 'var(--primary)' : 'var(--text-muted)',
                                          border: isInSquad ? '1px solid var(--primary)' : '1px solid var(--border)',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Disponível
                                      </button>
                                      <button 
                                        onClick={() => handleAvailability(athlete, game, false)}
                                        style={{ 
                                          fontSize: '0.65rem', 
                                          padding: '2px 8px', 
                                          borderRadius: '4px', 
                                          backgroundColor: !isInSquad ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)',
                                          color: !isInSquad ? 'var(--danger)' : 'var(--text-muted)',
                                          border: !isInSquad ? '1px solid var(--danger)' : '1px solid var(--border)',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Não Disponível
                                      </button>
                                    </div>
                                    <div className="text-muted" style={{ fontSize: '0.7rem', marginTop: '2px' }}>{athlete.position}</div>
                                  </div>
                                </div>

                                {isInSquad && (
                                  <div className="flex items-center gap-2">
                                     <button 
                                      onClick={() => shareIndividualPix(athlete, game)}
                                      className="btn-secondary"
                                      style={{ padding: '6px', backgroundColor: 'rgba(37, 211, 102, 0.1)', color: '#25D366' }}
                                      title="Enviar PIX por WhatsApp"
                                    >
                                      <DollarSign size={16} />
                                    </button>
                                    <button 
                                      className={`badge ${squadMember?.paid ? '' : 'pending'}`}
                                      onClick={() => togglePaymentStatus(selectedGameId, athlete.id)}
                                      style={{ 
                                        cursor: 'pointer',
                                        backgroundColor: squadMember?.paid ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                        color: squadMember?.paid ? 'var(--success)' : 'var(--danger)',
                                        border: 'none'
                                      }}
                                    >
                                      {squadMember?.paid ? 'Pago' : 'Pendente'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col gap-6">
                        <div className="card" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <h4 style={{ marginBottom: '16px' }}>Resultado da Partida</h4>
                          <div className="flex items-center justify-center gap-8" style={{ padding: '20px' }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>{teamConfig.name}</div>
                              <input 
                                type="number" 
                                value={game.scoreHome || 0} 
                                onChange={(e) => handleUpdateGameSummary(selectedGameId, parseInt(e.target.value) || 0, game.scoreAway || 0, game.matchReport || '')}
                                style={{ width: '60px', height: '60px', fontSize: '24px', textAlign: 'center', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}
                              />
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '20px' }}>X</div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>{game.opponent}</div>
                              <input 
                                type="number" 
                                value={game.scoreAway || 0} 
                                onChange={(e) => handleUpdateGameSummary(selectedGameId, game.scoreHome || 0, parseInt(e.target.value) || 0, game.matchReport || '')}
                                style={{ width: '60px', height: '60px', fontSize: '24px', textAlign: 'center', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="card" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <h4 style={{ marginBottom: '12px' }}>Súmula do Jogo</h4>
                          <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '12px' }}>Registre quem fez os gols, cartões e outras informações importantes.</p>
                          <textarea 
                            value={game.matchReport || ''} 
                            onChange={(e) => handleUpdateGameSummary(selectedGameId, game.scoreHome || 0, game.scoreAway || 0, e.target.value)}
                            placeholder="Ex: Gols: Emerson (2), Diego (1). Cartão Amarelo: Alex."
                            style={{ width: '100%', minHeight: '150px', padding: '12px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', resize: 'vertical' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {modalTab === 'squad' && (
                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-muted">Total Confirmados</div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{game.squad.length} Atletas</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="text-muted">Arrecadado</div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                            R$ {(game.squad.filter(s => s.paid).length || 0) * (game.fee || 0)} / R$ {(game.squad.length || 0) * (game.fee || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()
        )}
        {activeTab === 'agenda' && (
          <div>
            <div className="flex justify-between items-center" style={{ marginBottom: '32px' }}>
              <div>
                <h1 style={{ marginBottom: '4px' }}>Agenda do Time</h1>
                <p className="text-muted">Acompanhe os próximos compromissos e histórico.</p>
              </div>
              <button 
                className="btn-primary flex items-center gap-2"
                onClick={() => {
                  setNewGame({ opponent: '', opponentLogo: '', opponentLogoBg: 'dark', date: '', time: '', location: '', fee: 30 });
                  setIsAddingGame(true);
                }}
              >
                <Plus size={20} />
                Agendar Novo Jogo
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
              {/* Próximos Jogos */}
              <section>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Clock size={20} /> Próximas Partidas
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {games.filter(g => new Date(g.date) >= new Date(new Date().setHours(0,0,0,0))).length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                      <p className="text-muted">Nenhum jogo futuro marcado.</p>
                    </div>
                  ) : (
                    games
                      .filter(g => new Date(g.date) >= new Date(new Date().setHours(0,0,0,0)))
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                      .map(game => (
                        <div key={game.id} className="card flex justify-between items-center" style={{ borderLeft: '4px solid var(--primary)' }}>
                          <div className="flex items-center gap-4">
                            <div style={{ textAlign: 'center', minWidth: '60px', paddingRight: '20px', borderRight: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{game.date.split('-')[2]}</div>
                              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                {new Date(game.date + 'T12:00:00').toLocaleString('pt-BR', { month: 'short' })}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {game.opponentLogo ? (
                                  <img src={game.opponentLogo} style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: getBlendMode(game.opponentLogoBg) }} />
                                ) : (
                                  <Trophy size={20} opacity={0.3} />
                                )}
                              </div>
                              <div>
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{teamConfig.name} vs {game.opponent}</div>
                                <div className="flex gap-3 text-muted" style={{ fontSize: '0.875rem', marginTop: '4px' }}>
                                  <span className="flex items-center gap-1"><Clock size={14}/> {game.time}h</span>
                                  <span className="flex items-center gap-1"><MapPin size={14}/> {game.location}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <button onClick={() => setSelectedGameId(game.id)} className="btn-secondary" style={{ padding: '8px 16px' }}>Ver Detalhes</button>
                        </div>
                      ))
                  )}
                </div>
              </section>

              {/* Histórico */}
              <section>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Calendar size={20} /> Histórico de Partidas
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', opacity: 0.8 }}>
                  {games.filter(g => new Date(g.date) < new Date(new Date().setHours(0,0,0,0))).length === 0 ? (
                    <p className="text-muted" style={{ paddingLeft: '20px' }}>Nenhum jogo realizado ainda.</p>
                  ) : (
                    games
                      .filter(g => new Date(g.date) < new Date(new Date().setHours(0,0,0,0)))
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map(game => (
                        <div key={game.id} className="card flex justify-between items-center" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <div className="flex items-center gap-4 text-muted">
                            <div style={{ textAlign: 'center', minWidth: '60px' }}>
                              <div style={{ fontWeight: 'bold' }}>{game.date.split('-')[2]}/{game.date.split('-')[1]}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div style={{ width: '32px', height: '32px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', opacity: 0.5 }}>
                                {game.opponentLogo ? (
                                  <img src={game.opponentLogo} style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: getBlendMode(game.opponentLogoBg) }} />
                                ) : (
                                  <Trophy size={16} opacity={0.3} />
                                )}
                              </div>
                              <div>
                                <div style={{ fontWeight: '600' }}>{teamConfig.name} vs {game.opponent}</div>
                              </div>
                            </div>
                          </div>
                          <div style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                            FINALIZADO
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
        {activeTab === 'marketing' && (
          <div>
            <div className="flex flex-mobile-column justify-between items-center gap-4" style={{ marginBottom: '32px' }}>
              <div>
                <h1 style={{ marginBottom: '4px' }}>Gerador de Arte</h1>
                <p className="text-muted">Crie artes incríveis para divulgar as partidas.</p>
              </div>
            </div>

            <div className="flex flex-mobile-column gap-8 marketing-grid">
              <div style={{ flex: 1, minWidth: '300px' }}>
                <h3 style={{ marginBottom: '16px' }}>1. Selecione o Jogo</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {games.length === 0 ? (
                    <p className="text-muted">Nenhum jogo agendado.</p>
                  ) : (
                    games.map(game => (
                      <button
                        key={game.id}
                        onClick={() => setPreviewGameId(game.id)}
                        className={`card flex items-center gap-4 marketing-game-card`}
                        style={{ 
                          width: '100%', 
                          textAlign: 'left',
                          padding: '16px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          border: previewGameId === game.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                          backgroundColor: previewGameId === game.id ? 'rgba(46, 204, 113, 0.05)' : 'var(--surface)'
                        }}
                      >
                        <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {game.opponentLogo ? (
                            <img src={game.opponentLogo} style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: getBlendMode(game.opponentLogoBg) }} />
                          ) : (
                            <Trophy size={20} opacity={0.3} />
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: '600' }}>vs {game.opponent}</div>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>{formatDate(game.date)}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h3 style={{ marginBottom: '16px', width: '100%' }}>2. Pré-visualização (Social)</h3>
                {previewGameId ? (
                  (() => {
                    const game = games.find(g => g.id === previewGameId)
                    if (!game) return null
                    
                    return (
                      <div style={{ width: '100%', maxWidth: '380px' }} className="art-preview-container">
                        {/* THE ART CONTAINER */}
                        <div 
                          ref={artRef}
                          style={{ 
                            width: '100%', 
                            aspectRatio: '9/16', 
                            position: 'relative',
                            backgroundColor: '#000',
                            backgroundImage: 'url("https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=800&q=90")',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
                            borderRadius: '16px',
                            fontFamily: "'Outfit', sans-serif"
                          }}
                        >
                          {/* Dark overlay for readability */}
                          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,20,0,0.4) 30%, rgba(0,40,0,0.35) 50%, rgba(0,0,0,0.7) 75%, rgba(0,0,0,0.95) 100%)', pointerEvents: 'none' }}></div>

                          {/* Bokeh stadium lights */}
                          <div style={{ position: 'absolute', top: '2%', left: '15%', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.5)', filter: 'blur(8px)', pointerEvents: 'none' }}></div>
                          <div style={{ position: 'absolute', top: '1%', left: '30%', width: '14px', height: '14px', borderRadius: '50%', background: 'rgba(255,255,255,0.35)', filter: 'blur(6px)', pointerEvents: 'none' }}></div>
                          <div style={{ position: 'absolute', top: '3%', left: '50%', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(255,255,255,0.45)', filter: 'blur(7px)', pointerEvents: 'none' }}></div>
                          <div style={{ position: 'absolute', top: '1%', left: '70%', width: '12px', height: '12px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)', filter: 'blur(5px)', pointerEvents: 'none' }}></div>
                          <div style={{ position: 'absolute', top: '2%', right: '12%', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(255,255,255,0.5)', filter: 'blur(9px)', pointerEvents: 'none' }}></div>
                          <div style={{ position: 'absolute', top: '4%', left: '8%', width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)', filter: 'blur(4px)', pointerEvents: 'none' }}></div>
                          <div style={{ position: 'absolute', top: '5%', right: '35%', width: '16px', height: '16px', borderRadius: '50%', background: 'rgba(255,255,255,0.35)', filter: 'blur(6px)', pointerEvents: 'none' }}></div>

                          {/* Goal net lines (top-right) */}
                          <svg style={{ position: 'absolute', top: '5%', right: '2%', width: '120px', height: '120px', opacity: 0.15, pointerEvents: 'none' }}>
                            <line x1="0" y1="0" x2="120" y2="120" stroke="white" strokeWidth="0.5" />
                            <line x1="30" y1="0" x2="120" y2="90" stroke="white" strokeWidth="0.5" />
                            <line x1="60" y1="0" x2="120" y2="60" stroke="white" strokeWidth="0.5" />
                            <line x1="90" y1="0" x2="120" y2="30" stroke="white" strokeWidth="0.5" />
                            <line x1="0" y1="30" x2="90" y2="120" stroke="white" strokeWidth="0.5" />
                            <line x1="0" y1="60" x2="60" y2="120" stroke="white" strokeWidth="0.5" />
                            <line x1="0" y1="90" x2="30" y2="120" stroke="white" strokeWidth="0.5" />
                          </svg>

                          {/* Soccer ball (top-right area) */}
                          <div style={{ position: 'absolute', top: '8%', right: '5%', width: '55px', height: '55px', borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #fff 0%, #e0e0e0 40%, #bbb 70%, #888 100%)', boxShadow: '3px 3px 8px rgba(0,0,0,0.5), inset -2px -2px 4px rgba(0,0,0,0.15)', zIndex: 1, opacity: 0.9 }}>
                            {/* Pentagon pattern */}
                            <div style={{ position: 'absolute', top: '25%', left: '30%', width: '18px', height: '18px', background: '#333', clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)', opacity: 0.7 }}></div>
                            <div style={{ position: 'absolute', top: '5%', left: '50%', width: '10px', height: '10px', background: '#333', clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)', opacity: 0.5 }}></div>
                            <div style={{ position: 'absolute', bottom: '15%', right: '15%', width: '12px', height: '12px', background: '#333', clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)', opacity: 0.5 }}></div>
                          </div>

                          {/* === HEADER: DATE === */}
                          <div style={{ textAlign: 'center', paddingTop: '35px', zIndex: 2 }}>
                            <div style={{ 
                              fontSize: '2.5rem', 
                              fontWeight: '900', 
                              color: 'white', 
                              lineHeight: '1',
                              textShadow: '3px 3px 0px rgba(0,0,0,0.7), 0 0 20px rgba(0,0,0,0.5)',
                              letterSpacing: '3px',
                              WebkitTextStroke: '1px rgba(0,0,0,0.2)'
                            }}>
                              {formatDate(game.date).split('/')[0]} DE {new Date(game.date + 'T12:00:00').toLocaleString('pt-BR', { month: 'long' }).toUpperCase()}
                            </div>
                            <div style={{ 
                              fontSize: '1.4rem', 
                              fontWeight: '900', 
                              color: '#f1c40f', 
                              marginTop: '8px',
                              fontStyle: 'italic',
                              textShadow: '2px 2px 4px rgba(0,0,0,0.9), 0 0 15px rgba(241,196,15,0.3)',
                              letterSpacing: '3px'
                            }}>
                              DIA DE CL&Aacute;SSICO
                            </div>
                          </div>

                          {/* === LOGOS SECTION === */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '0 10px', marginTop: '35px', zIndex: 2 }}>
                            {/* Opponent Logo */}
                            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                              <div style={{ width: '140px', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.7))' }}>
                                {game.opponentLogo ? (
                                  <img src={game.opponentLogo} style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: getBlendMode(game.opponentLogoBg) }} />
                                ) : (
                                  <div style={{ width: '110px', height: '110px', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Trophy size={55} color="rgba(255,255,255,0.4)" />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* VS Lightning */}
                            <div style={{ 
                              color: '#a78bfa', 
                              fontSize: '1.4rem', 
                              fontWeight: '900', 
                              fontStyle: 'italic',
                              textShadow: '0 0 15px rgba(167,139,250,0.6), 0 0 30px rgba(167,139,250,0.3)',
                              padding: '0 2px',
                              zIndex: 2
                            }}>VS</div>

                            {/* Home Logo */}
                            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                              <div style={{ width: '140px', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.7))' }}>
                                {teamConfig.logoUrl ? (
                                  <img src={teamConfig.logoUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: getBlendMode(teamConfig.logoBgType) }} />
                                ) : (
                                  <div style={{ width: '110px', height: '110px', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Trophy size={55} color="var(--primary)" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* === TEAM NAMES BAR === */}
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            width: '88%',
                            marginTop: '20px',
                            zIndex: 2
                          }}>
                            <div style={{ 
                              backgroundColor: 'rgba(255,255,255,0.95)', 
                              color: '#1a1a1a', 
                              padding: '8px 14px', 
                              borderRadius: '50px 0 0 50px', 
                              flex: 1, 
                              textAlign: 'center', 
                              fontWeight: '800', 
                              fontSize: '0.7rem', 
                              letterSpacing: '1px',
                              minHeight: '42px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              lineHeight: '1.15',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                            }}>
                              {game.opponent.toUpperCase()}
                            </div>
                            <div style={{ 
                              width: '40px', 
                              height: '40px', 
                              backgroundColor: '#f1c40f', 
                              color: 'white', 
                              borderRadius: '50%', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              fontWeight: '900', 
                              fontSize: '1.2rem',
                              flexShrink: 0,
                              zIndex: 3,
                              margin: '0 -8px',
                              boxShadow: '0 3px 10px rgba(0,0,0,0.4)'
                            }}>
                              X
                            </div>
                            <div style={{ 
                              backgroundColor: 'rgba(255,255,255,0.95)', 
                              color: '#1a1a1a', 
                              padding: '8px 14px', 
                              borderRadius: '0 50px 50px 0', 
                              flex: 1, 
                              textAlign: 'center', 
                              fontWeight: '800', 
                              fontSize: '0.7rem',
                              letterSpacing: '1px',
                              minHeight: '42px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              lineHeight: '1.15',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                            }}>
                              {teamConfig.name.toUpperCase()}
                            </div>
                          </div>

                          {/* === TIME === */}
                          <div style={{ textAlign: 'center', marginTop: '30px', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <div style={{ fontSize: '1.3rem', color: 'white', fontWeight: '800', letterSpacing: '4px', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>&Agrave;S</div>
                            <div style={{ fontSize: '4.5rem', fontWeight: '900', color: 'white', lineHeight: '1', textShadow: '4px 4px 0px rgba(0,0,0,0.5), 0 0 30px rgba(255,255,255,0.15)', letterSpacing: '3px' }}>
                              {game.time}H
                            </div>
                          </div>

                          {/* === BOTTOM: GREEN GRASS STRIP + LOCATION === */}
                          <div style={{ 
                            width: '100%', 
                            position: 'relative',
                            zIndex: 2,
                            marginTop: 'auto'
                          }}>
                            {/* Green grass strip */}
                            <div style={{ 
                              width: '110%', 
                              marginLeft: '-5%',
                              background: 'linear-gradient(90deg, #1a6b1a, #2d8a2d, #1a6b1a, #2d8a2d, #1a6b1a)',
                              padding: '12px 0',
                              textAlign: 'center',
                              transform: 'rotate(-1.5deg)',
                              boxShadow: '0 -4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
                              borderTop: '2px solid rgba(255,255,255,0.1)'
                            }}>
                              <div style={{ 
                                color: '#f1c40f', 
                                fontWeight: '900', 
                                letterSpacing: '0.15em', 
                                fontSize: '0.85rem',
                                textShadow: '1px 1px 3px rgba(0,0,0,0.6)'
                              }}>
                                {game.location.toUpperCase()}
                              </div>
                            </div>
                          </div>
                          
                          {/* Credit footer */}
                          <div style={{ 
                            padding: '8px 0',
                            fontSize: '0.45rem', 
                            color: 'rgba(255,255,255,0.35)',
                            fontWeight: '600',
                            letterSpacing: '0.15em',
                            zIndex: 2,
                            background: 'rgba(0,0,0,0.8)',
                            width: '100%',
                            textAlign: 'center'
                          }}>
                            GERADO POR {teamConfig.name.toUpperCase()} APP
                          </div>
                        </div>

                        
                        <div className="flex flex-mobile-column gap-3" style={{ marginTop: '24px', width: '100%' }}>
                          <button 
                            onClick={handleShareArt}
                            className="btn-primary flex items-center justify-center gap-2"
                            style={{ flex: 1, padding: '14px', backgroundColor: '#25D366', color: 'white', border: 'none', boxShadow: '0 4px 14px rgba(37, 211, 102, 0.4)' }}
                          >
                            <Share2 size={20} />
                            Compartilhar Arte (WhatsApp)
                          </button>
                          <button 
                            onClick={handleDownloadArt}
                            className="btn-secondary flex items-center justify-center gap-2"
                            style={{ flex: 1, padding: '14px' }}
                          >
                            <Trophy size={20} />
                            Baixar Imagem
                          </button>
                        </div>
                        
                        <div style={{ marginTop: '12px', width: '100%' }}>
                          <button 
                            onClick={() => {
                              const text = encodeURIComponent(`Fala galera! Olha o convite para o nosso próximo jogo vs ${game.opponent}! ⚽🔥`);
                              window.open(`https://wa.me/?text=${text}`, '_blank');
                            }}
                            className="flex items-center justify-center gap-2"
                            style={{ width: '100%', padding: '10px', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.875rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
                          >
                            <Phone size={16} />
                            Enviar apenas texto
                          </button>
                        </div>
                        
                        <p className="text-muted text-center" style={{ fontSize: '0.75rem', marginTop: '16px' }}>
                          <b>Dica:</b> Use o botão verde acima para compartilhar diretamente no WhatsApp! Se estiver no computador, a imagem será baixada automaticamente.
                        </p>
                      </div>
                    )
                  })()
                ) : (
                  <div className="card" style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p className="text-muted">Selecione um jogo ao lado para gerar a arte.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
