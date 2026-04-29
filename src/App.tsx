import { useState, useEffect, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { Plus, Users, Trophy, LayoutDashboard, Trash2, Edit2, Phone, Calendar, Clock, MapPin, DollarSign, Share2, BarChart2 } from 'lucide-react'
import type { Athlete, Game, PlayerPosition, TeamConfig } from './types'
import { DEFAULT_POSITIONS } from './types'
import { supabase } from './lib/supabase'
import { toPng } from 'html-to-image'
import { useRef } from 'react'
import './index.css'

export default function App() {
  const [activeTab, setActiveTab] = useState<'athletes' | 'games' | 'dashboard' | 'agenda' | 'marketing' | 'estatisticas'>('dashboard')
  const [modalTab, setModalTab] = useState<'squad' | 'summary'>('squad')
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [previewGameId, setPreviewGameId] = useState<string | null>(null)
  const [publicGameId, setPublicGameId] = useState<string | null>(null)
  const [dashboardTacticalGameId, setDashboardTacticalGameId] = useState<string | null>(null)
  const [formation, setFormation] = useState<string>(() => {
    return localStorage.getItem('formation') || '4-4-2'
  })

  // States for WhatsApp-style cropping
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)
  const [rawImage, setRawImage] = useState<string | null>(null)
  
  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gameId = params.get('gameId')
    if (gameId) {
      setPublicGameId(gameId)
    }
  }, [])

  // Initial fetch from Supabase if available
  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) {
        console.log('[Supabase] Não conectado - usando apenas localStorage');
        return;
      }

      console.log('[Supabase] Buscando dados do banco...');

      const { data: athletesData, error: athletesError } = await supabase.from('athletes').select('*');
      if (athletesError) {
        console.error('[Supabase] Erro ao buscar atletas:', athletesError);
      } else if (athletesData) {
        console.log(`[Supabase] ${athletesData.length} atletas carregados`);
        setAthletes(athletesData.map(a => ({
          ...a,
          avatarUrl: a.avatar_url
        })));
      }

      const { data: gamesData, error: gamesError } = await supabase.from('games').select('*, squad:squad_entries(*)');
      if (gamesError) {
        console.error('[Supabase] Erro ao buscar jogos:', gamesError);
      } else if (gamesData) {
        console.log(`[Supabase] ${gamesData.length} jogos carregados`);
        
        // Get current games from localStorage to preserve any data Supabase might not have
        const localGamesRaw = localStorage.getItem('games');
        const localGames: Game[] = localGamesRaw ? JSON.parse(localGamesRaw) : [];
        const localGamesMap = new Map(localGames.map(g => [g.id, g]));
        
        // Collect games that need to be synced UP to Supabase
        const gamesToSync: { id: string; score_home?: number; score_away?: number; match_report?: string }[] = [];
        
        const mergedGames = gamesData.map(g => {
          const localGame = localGamesMap.get(g.id);
          
          // Use Supabase data as primary, but fall back to localStorage for match report fields
          const scoreHome = g.score_home ?? localGame?.scoreHome;
          const scoreAway = g.score_away ?? localGame?.scoreAway;
          const matchReport = g.match_report ?? localGame?.matchReport;
          
          // If localStorage has data that Supabase doesn't, queue it for sync
          if (localGame && (!g.match_report && localGame.matchReport || g.score_home == null && localGame.scoreHome != null || g.score_away == null && localGame.scoreAway != null)) {
            const syncData: any = { id: g.id };
            if (!g.match_report && localGame.matchReport) syncData.match_report = localGame.matchReport;
            if (g.score_home == null && localGame.scoreHome != null) syncData.score_home = localGame.scoreHome;
            if (g.score_away == null && localGame.scoreAway != null) syncData.score_away = localGame.scoreAway;
            gamesToSync.push(syncData);
            console.warn(`[Supabase] Jogo vs ${g.opponent}: dados faltando no banco. Sincronizando localStorage → Supabase...`);
          }
          
          return {
            id: g.id,
            opponent: g.opponent,
            opponentLogo: g.opponent_logo,
            opponentLogoBg: g.opponent_logo_bg,
            date: g.date,
            time: g.time,
            location: g.location,
            fee: g.fee,
            scoreHome,
            scoreAway,
            matchReport,
            formation: g.formation,
            squad: g.squad.map((s: any) => ({ 
              athleteId: s.athlete_id, 
              paid: s.paid,
              status: s.status || 'pending',
              isStarter: s.is_starter !== undefined ? s.is_starter : null
            }))
          };
        });
        
        setGames(mergedGames);
        
        // Sync missing data from localStorage up to Supabase
        if (gamesToSync.length > 0) {
          console.log(`[Supabase] Sincronizando ${gamesToSync.length} jogo(s) para o banco...`);
          for (const gameSync of gamesToSync) {
            const { id, ...updateData } = gameSync;
            const { error: syncError } = await supabase.from('games').update(updateData).eq('id', id);
            if (syncError) {
              console.error(`[Supabase] Erro ao sincronizar jogo ${id}:`, syncError);
            } else {
              console.log(`[Supabase] Jogo ${id} sincronizado com sucesso!`);
            }
          }
        }
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

  const generateCroppedImage = async (): Promise<string> => {
    if (!rawImage || !croppedAreaPixels) return '';
    
    return new Promise((resolve) => {
      const img = new Image();
      img.src = rawImage;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve('');

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 300, 300);
        
        ctx.drawImage(
          img,
          croppedAreaPixels.x,
          croppedAreaPixels.y,
          croppedAreaPixels.width,
          croppedAreaPixels.height,
          0,
          0,
          300,
          300
        );
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve('');
    });
  };

  const handleAddAthlete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAthlete.name || !newAthlete.phone) return

    const finalAvatarUrl = rawImage ? await generateCroppedImage() : newAthlete.avatarUrl;

    const athlete: Athlete = {
      id: newAthlete.id || crypto.randomUUID(),
      name: newAthlete.name,
      position: newAthlete.position as PlayerPosition,
      phone: newAthlete.phone,
      avatarUrl: finalAvatarUrl
    }

    if (newAthlete.id) {
      setAthletes(prev => prev.map(a => a.id === newAthlete.id ? athlete : a))
    } else {
      setAthletes(prev => [...prev, athlete])
    }
    
    if (supabase) {
      await supabase.from('athletes').upsert({
        id: athlete.id,
        name: athlete.name,
        position: athlete.position,
        phone: athlete.phone,
        avatar_url: athlete.avatarUrl
      })
    }

    setNewAthlete({ name: '', position: 'Meio-campo', phone: '', avatarUrl: '' })
    setRawImage(null)
    setZoom(1)
    setCrop({ x: 0, y: 0 })
    setIsAddingAthlete(false)
  }

  const handleEditAthlete = (athlete: Athlete) => {
    setNewAthlete(athlete)
    setRawImage(null)
    setZoom(1)
    setCrop({ x: 0, y: 0 })
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
        const base64 = reader.result as string;
        setRawImage(base64);
        setZoom(1);
        setCrop({ x: 0, y: 0 });
        callback(base64);
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

    const isEditing = !!newGame.id;
    // When editing, preserve existing score/report/formation from the current game state
    const existingGame = isEditing ? games.find(g => g.id === newGame.id) : null;

    const game: Game = {
      id: newGame.id || crypto.randomUUID(),
      opponent: newGame.opponent,
      opponentLogo: newGame.opponentLogo || '',
      opponentLogoBg: newGame.opponentLogoBg || 'dark',
      date: newGame.date,
      time: newGame.time || '',
      location: newGame.location || '',
      fee: newGame.fee || 30,
      squad: newGame.squad || existingGame?.squad || [],
      scoreHome: newGame.scoreHome ?? existingGame?.scoreHome,
      scoreAway: newGame.scoreAway ?? existingGame?.scoreAway,
      matchReport: newGame.matchReport ?? existingGame?.matchReport,
      formation: newGame.formation || existingGame?.formation || formation
    }

    if (isEditing) {
      setGames(prev => prev.map(g => g.id === newGame.id ? game : g))
    } else {
      setGames(prev => [...prev, game])
    }

    if (supabase) {
      // Build the upsert data, always including core fields
      const upsertData: Record<string, any> = {
        id: game.id,
        opponent: game.opponent,
        opponent_logo: game.opponentLogo,
        opponent_logo_bg: game.opponentLogoBg,
        date: game.date,
        time: game.time,
        location: game.location,
        fee: game.fee,
        formation: game.formation
      };

      // Only include score/report if they have actual values to avoid nullifying existing data
      if (game.scoreHome !== undefined && game.scoreHome !== null) {
        upsertData.score_home = game.scoreHome;
      }
      if (game.scoreAway !== undefined && game.scoreAway !== null) {
        upsertData.score_away = game.scoreAway;
      }
      if (game.matchReport !== undefined && game.matchReport !== null) {
        upsertData.match_report = game.matchReport;
      }

      await supabase.from('games').upsert(upsertData);
    }

    setNewGame({ opponent: '', opponentLogo: '', opponentLogoBg: 'dark', date: '', time: '', location: '', fee: 30 })
    setIsAddingGame(false)
  }

  const handleUpdateGameSummary = async (gameId: string, scoreHome: number, scoreAway: number, matchReport: string) => {
    setGames(prev => prev.map(g => g.id === gameId ? { ...g, scoreHome, scoreAway, matchReport } : g));
    
    if (supabase) {
      try {
        const { error } = await supabase.from('games').update({
          score_home: scoreHome,
          score_away: scoreAway,
          match_report: matchReport
        }).eq('id', gameId);
        
        if (error) {
          console.error('Error updating game summary:', error);
        }
      } catch (err) {
        console.error('Unexpected error updating game summary:', err);
      }
    }
  }

  const toggleAthleteStatus = async (gameId: string, athleteId: string, isStarter: boolean) => {
    const game = games.find(g => g.id === gameId);
    if (!game) return;

    const squadMember = game.squad.find(s => s.athleteId === athleteId);
    let updatedSquad;

    if (!squadMember) {
      updatedSquad = [...game.squad, { athleteId, paid: false, status: 'pending' as const, isStarter }];
    } else {
      updatedSquad = game.squad.map(s => 
        s.athleteId === athleteId ? { ...s, isStarter } : s
      );
    }

    setGames(prev => prev.map(g => g.id === gameId ? { ...g, squad: updatedSquad } : g));

    const entry = updatedSquad?.find(s => s.athleteId === athleteId);
    if (supabase && entry) {
      await supabase.from('squad_entries').upsert({
        game_id: gameId,
        athlete_id: athleteId,
        is_starter: isStarter,
        status: entry.status || 'pending'
      });
    }
  };

  const toggleAthleteInSquad = async (gameId: string, athleteId: string) => {
    const game = games.find(g => g.id === gameId);
    if (!game) return;

    const isInSquad = game.squad.find(s => s.athleteId === athleteId);
    
    if (isInSquad) {
      setGames(prev => prev.map(g => g.id === gameId ? { ...g, squad: g.squad.filter(s => s.athleteId !== athleteId) } : g));
      if (supabase) {
        await supabase.from('squad_entries').delete().eq('game_id', gameId).eq('athlete_id', athleteId);
      }
    } else {
      const newEntry = { athleteId, paid: false, status: 'pending' as const, isStarter: null };
      setGames(prev => prev.map(g => g.id === gameId ? { ...g, squad: [...g.squad, newEntry] } : g));
      if (supabase) {
        await supabase.from('squad_entries').insert({
          game_id: gameId,
          athlete_id: athleteId,
          paid: false,
          status: 'pending',
          is_starter: null
        });
      }
    }
  }

  const toggleAllAthletesInSquad = async (gameId: string) => {
    const game = games.find(g => g.id === gameId);
    if (!game) return;

    const allSelected = game.squad.length === athletes.length && athletes.length > 0;

    if (allSelected) {
      // Deselect all
      setGames(prev => prev.map(g => g.id === gameId ? { ...g, squad: [] } : g));
      if (supabase) {
        await supabase.from('squad_entries').delete().eq('game_id', gameId);
      }
    } else {
      // Select all missing athletes
      const currentAthleteIds = new Set(game.squad.map(s => s.athleteId));
      const athletesToAdd = athletes.filter(a => !currentAthleteIds.has(a.id));
      
      const newEntries = athletesToAdd.map(a => ({
        athleteId: a.id,
        paid: false,
        status: 'pending' as const,
        isStarter: null
      }));

      setGames(prev => prev.map(g => g.id === gameId ? { ...g, squad: [...g.squad, ...newEntries] } : g));
      
      if (supabase && athletesToAdd.length > 0) {
        const insertData = athletesToAdd.map(a => ({
          game_id: gameId,
          athlete_id: a.id,
          paid: false,
          status: 'pending',
          is_starter: null
        }));
        await supabase.from('squad_entries').insert(insertData);
      }
    }
  };

  const togglePaymentStatus = async (gameId: string, athleteId: string) => {
    const game = games.find(g => g.id === gameId);
    if (!game) return;
    const entry = game.squad.find(s => s.athleteId === athleteId);
    if (!entry) return;

    setGames(prev => prev.map(game => {
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

  const handlePublicConfirmation = async (gameId: string, athleteId: string, status: 'confirmed' | 'declined' | 'pending') => {
    // Atualiza o status sem remover o atleta da convocação para podermos contar a assiduidade
    setGames(prev => prev.map(game => {
      if (game.id !== gameId) return game
      return {
        ...game,
        squad: game.squad.map(s => s.athleteId === athleteId ? { ...s, status } : s)
      }
    }))

    if (supabase) {
      await supabase.from('squad_entries').update({ status }).eq('game_id', gameId).eq('athlete_id', athleteId)
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
    
    // Link Público para Confirmação
    const publicUrl = `${window.location.origin}${window.location.pathname}?gameId=${gameId}`
    text += `\n✅ *CONFIRME SUA PRESENÇA AQUI:*\n${publicUrl}\n`
    
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
      setAthletes(prev => prev.filter(a => a.id !== id))
      if (supabase) {
        await supabase.from('athletes').delete().eq('id', id)
      }
    }
  }

  const deleteGame = async (id: string) => {
    if (confirm('Tem certeza que deseja remover este jogo?')) {
      setGames(prev => prev.filter(g => g.id !== id))
      if (supabase) {
        await supabase.from('games').delete().eq('id', id)
      }
    }
  }

  if (publicGameId) {
    const game = games.find(g => g.id === publicGameId)
    if (!game) return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '20px', textAlign: 'center' }}>
        <Trophy size={48} color="var(--primary)" style={{ marginBottom: '16px' }} />
        <h2>Jogo não encontrado</h2>
        <p className="text-muted">O link que você acessou pode estar expirado ou incorreto.</p>
        <button onClick={() => setPublicGameId(null)} className="btn-primary" style={{ marginTop: '20px' }}>Voltar ao Início</button>
      </div>
    )

    return (
      <div className="public-view" style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', padding: '20px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          {/* Header */}
          <div className="card" style={{ textAlign: 'center', marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', backgroundColor: 'var(--primary)' }}></div>
            <h2 style={{ marginBottom: '8px' }}>Convocação Oficial</h2>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)', marginBottom: '16px' }}>{teamConfig.name}</div>
            
            <div className="flex justify-center items-center gap-2" style={{ marginBottom: '24px' }}>
              <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ 
                  width: '70px', 
                  height: '70px', 
                  borderRadius: '50%', 
                  backgroundColor: 'rgba(255,255,255,0.03)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  marginBottom: '10px',
                  border: '1px solid rgba(255,255,255,0.05)',
                  overflow: 'hidden'
                }}>
                  {teamConfig.logoUrl ? (
                    <img src={teamConfig.logoUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <Trophy size={32} color="var(--primary)" />
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: '800', lineHeight: '1.2', color: '#fff' }}>{teamConfig.name}</div>
              </div>

              <div style={{ fontSize: '1.2rem', fontWeight: '900', opacity: 0.2, padding: '0 10px', marginTop: '-20px' }}>VS</div>

              <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ 
                  width: '70px', 
                  height: '70px', 
                  borderRadius: '50%', 
                  backgroundColor: 'rgba(255,255,255,0.03)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  marginBottom: '10px',
                  border: '1px solid rgba(255,255,255,0.05)',
                  overflow: 'hidden'
                }}>
                  {game.opponentLogo ? (
                    <img src={game.opponentLogo} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <Trophy size={32} color="var(--primary)" />
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: '800', lineHeight: '1.2', color: '#fff' }}>{game.opponent}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', textAlign: 'left', backgroundColor: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px' }}>
              <div className="flex items-center gap-2 text-muted" style={{ fontSize: '0.85rem' }}>
                <Calendar size={16} /> <span>{formatDate(game.date)}</span>
              </div>
              <div className="flex items-center gap-2 text-muted" style={{ fontSize: '0.85rem' }}>
                <Clock size={16} /> <span>{game.time}h</span>
              </div>
              <div className="flex items-center gap-3 text-muted" style={{ fontSize: '0.85rem', gridColumn: 'span 2' }}>
                <MapPin size={16} /> <span>{game.location}</span>
              </div>
            </div>
          </div>

          {/* List */}
          <div className="card">
            <h3 style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
              Lista de Atletas
              <span style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>{game.squad.filter(s => s.status === 'confirmed').length} Confirmados</span>
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {game.squad.map(entry => {
                const athlete = athletes.find(a => a.id === entry.athleteId)
                if (!athlete) return null
                
                return (
                  <div key={athlete.id} style={{ 
                    padding: '12px', 
                    borderRadius: '12px', 
                    backgroundColor: 'var(--surface-hover)',
                    border: entry.status === 'confirmed' ? '1px solid var(--primary)' : entry.status === 'declined' ? '1px solid var(--danger)' : '1px solid transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div className="flex items-center gap-3">
                      <div style={{ width: '44px', height: '44px', borderRadius: '50%', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                        {athlete.avatarUrl ? (
                          <img src={athlete.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <Users size={20} opacity={0.3} />
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '1rem' }}>{athlete.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{athlete.position}</div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      {entry.status === 'pending' ? (
                        <>
                          <button 
                            onClick={() => handlePublicConfirmation(game.id, athlete.id, 'confirmed')}
                            className="btn-primary" 
                            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                          >
                            Vou
                          </button>
                          <button 
                            onClick={() => handlePublicConfirmation(game.id, athlete.id, 'declined')}
                            className="btn-secondary" 
                            style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--danger)' }}
                          >
                            Não vou
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span style={{ 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold', 
                            color: entry.status === 'confirmed' ? 'var(--primary)' : 'var(--danger)',
                            textTransform: 'uppercase'
                          }}>
                            {entry.status === 'confirmed' ? 'Confirmado ✓' : 'Recusado ✕'}
                          </span>
                          <button 
                            onClick={() => handlePublicConfirmation(game.id, athlete.id, 'pending')}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            Alterar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '24px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Powered by {teamConfig.name} Manager
          </div>
        </div>
      </div>
    )
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
              value={teamConfig.pixKey || ''}
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
          <button 
            onClick={() => setActiveTab('estatisticas')}
            className={`flex items-center gap-2 nav-item ${activeTab === 'estatisticas' ? 'active' : ''}`}
          >
            <BarChart2 size={20} />
            Estatísticas
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
        <button onClick={() => setActiveTab('estatisticas')} className={`mobile-nav-item ${activeTab === 'estatisticas' ? 'active' : ''}`}>
          <BarChart2 size={20} />
          <span>Estatísticas</span>
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

            {/* Mobile-only settings block */}
            <div className="show-only-mobile" style={{ marginBottom: '32px' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '1rem' }}>Configurações do Time</h3>
              <div className="card" style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-muted)' }}>CHAVE PIX</label>
                  <input 
                    type="text" 
                    value={teamConfig.pixKey || ''}
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
                      <input type="radio" name="mobileTeamLogoBg" checked={teamConfig.logoBgType !== 'light'} onChange={() => setTeamConfig({...teamConfig, logoBgType: 'dark'})} style={{ width: '12px', height: '12px' }} />
                      Fundo Escuro
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', cursor: 'pointer', color: teamConfig.logoBgType === 'light' ? 'var(--primary)' : 'var(--text-muted)' }}>
                      <input type="radio" name="mobileTeamLogoBg" checked={teamConfig.logoBgType === 'light'} onChange={() => setTeamConfig({...teamConfig, logoBgType: 'light'})} style={{ width: '12px', height: '12px' }} />
                      Fundo Claro
                    </label>
                  </div>
                </div>
              </div>
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
                      <div 
                        key={game.id} 
                        className="flex justify-between items-center p-3" 
                        style={{ 
                          backgroundColor: dashboardTacticalGameId === game.id ? 'rgba(46, 204, 113, 0.1)' : 'var(--surface-hover)', 
                          borderRadius: '8px',
                          border: dashboardTacticalGameId === game.id ? '1px solid var(--primary)' : '1px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onClick={() => {
                          setDashboardTacticalGameId(game.id);
                          // Optional: scroll slightly to bring tactical field into view if it's far down
                        }}
                      >
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
                {(() => {
                  let nextGame = games.find(g => g.id === dashboardTacticalGameId);
                  
                  if (!nextGame) {
                    const today = new Date().toISOString().split('T')[0];
                    nextGame = games
                      .filter(g => g.date >= today)
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
                  }

                  const today = new Date().toISOString().split('T')[0];
                  const isPastGame = nextGame && nextGame.date < today;
                  const gameFormation = nextGame?.formation || formation;

                  return (
                    <>
                      <div className="flex justify-between items-center" style={{ marginBottom: '20px' }}>
                        <h3>{isPastGame ? 'Escalação Tática (Finalizado)' : 'Próxima Convocação Tática'}</h3>
                        <select
                          value={isPastGame ? gameFormation : formation}
                          onChange={e => {
                            setFormation(e.target.value);
                            if (nextGame && !isPastGame) {
                              setGames(games.map(g => g.id === nextGame!.id ? { ...g, formation: e.target.value } : g));
                              // In a real DB scenario, we would also update Supabase here:
                              // supabase.from('games').update({ formation: e.target.value }).eq('id', nextGame.id)
                            }
                          }}
                          disabled={isPastGame}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            backgroundColor: isPastGame ? 'rgba(255,255,255,0.05)' : 'var(--surface-hover)',
                            border: '1px solid var(--border)',
                            color: isPastGame ? 'var(--text-muted)' : 'var(--text)',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: isPastGame ? 'not-allowed' : 'pointer'
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

                  if (!nextGame || nextGame.squad.length === 0) {
                    return <p className="text-muted">{!nextGame ? 'Nenhum jogo futuro agendado.' : 'Nenhum atleta convocado para este jogo.'}</p>;
                  }

                  const confirmedCount = nextGame.squad.filter(s => s.status === 'confirmed').length;
                  if (confirmedCount === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: '20px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                        <Clock size={24} className="text-muted" style={{ marginBottom: '8px' }} />
                        <p className="text-muted">Aguardando confirmações dos atletas para montar o campo...</p>
                      </div>
                    );
                  }

                  const starters = nextGame.squad.filter(s => s.isStarter === true && s.status === 'confirmed');
                  const benchEntries = nextGame.squad.filter(s => s.isStarter !== true && s.status === 'confirmed');
                  
                  const starterAthletes = athletes.filter(a => starters.some(s => s.athleteId === a.id));
                  const benchList = athletes.filter(a => benchEntries.some(s => s.athleteId === a.id));

                  // Slot: x%, y%, preferred position, color
                  type Slot = { x: number; y: number; role: string; color: string };
                  const F: Record<string, Slot[]> = {
                    // 4-4-2: Clássico — 2 atacantes, 4 meias, 4 defensores
                    '4-4-2': [
                      { x: 35, y: 15, role: 'Atacante', color: '#f1c40f' }, { x: 65, y: 15, role: 'Atacante', color: '#f1c40f' },
                      { x: 15, y: 40, role: 'Meio-campo', color: '#3498db' }, { x: 38, y: 40, role: 'Meio-campo', color: '#3498db' },
                      { x: 62, y: 40, role: 'Cabeça de Area', color: '#3498db' }, { x: 85, y: 40, role: 'Meio-campo', color: '#3498db' },
                      { x: 15, y: 70, role: 'Lateral', color: '#e74c3c' }, { x: 38, y: 70, role: 'Zagueiro', color: '#e74c3c' },
                      { x: 62, y: 70, role: 'Zagueiro', color: '#e74c3c' }, { x: 85, y: 70, role: 'Lateral', color: '#e74c3c' },
                    ],
                    // 4-3-3: Ofensivo — 3 atacantes, 3 meias, 4 defensores
                    '4-3-3': [
                      { x: 20, y: 15, role: 'Atacante', color: '#f1c40f' }, { x: 50, y: 12, role: 'Atacante', color: '#f1c40f' }, { x: 80, y: 15, role: 'Atacante', color: '#f1c40f' },
                      { x: 25, y: 42, role: 'Meio-campo', color: '#3498db' }, { x: 50, y: 40, role: 'Cabeça de Area', color: '#3498db' }, { x: 75, y: 42, role: 'Meio-campo', color: '#3498db' },
                      { x: 15, y: 70, role: 'Lateral', color: '#e74c3c' }, { x: 38, y: 70, role: 'Zagueiro', color: '#e74c3c' },
                      { x: 62, y: 70, role: 'Zagueiro', color: '#e74c3c' }, { x: 85, y: 70, role: 'Lateral', color: '#e74c3c' },
                    ],
                    // 4-5-1: Compacto — 1 atacante, 5 meias, 4 defensores
                    '4-5-1': [
                      { x: 50, y: 12, role: 'Atacante', color: '#f1c40f' },
                      { x: 10, y: 38, role: 'Meio-campo', color: '#3498db' }, { x: 30, y: 40, role: 'Meio-campo', color: '#3498db' },
                      { x: 50, y: 38, role: 'Cabeça de Area', color: '#3498db' }, { x: 70, y: 40, role: 'Meio-campo', color: '#3498db' }, { x: 90, y: 38, role: 'Meio-campo', color: '#3498db' },
                      { x: 15, y: 70, role: 'Lateral', color: '#e74c3c' }, { x: 38, y: 70, role: 'Zagueiro', color: '#e74c3c' },
                      { x: 62, y: 70, role: 'Zagueiro', color: '#e74c3c' }, { x: 85, y: 70, role: 'Lateral', color: '#e74c3c' },
                    ],
                    // 4-2-3-1: Moderno — 1 atacante, 3 meias ofensivos, 2 volantes, 4 defensores
                    '4-2-3-1': [
                      { x: 50, y: 12, role: 'Atacante', color: '#f1c40f' },
                      { x: 20, y: 30, role: 'Meio-campo', color: '#3498db' }, { x: 50, y: 28, role: 'Meio-campo', color: '#3498db' }, { x: 80, y: 30, role: 'Meio-campo', color: '#3498db' },
                      { x: 35, y: 50, role: 'Cabeça de Area', color: '#9b59b6' }, { x: 65, y: 50, role: 'Cabeça de Area', color: '#9b59b6' },
                      { x: 15, y: 70, role: 'Lateral', color: '#e74c3c' }, { x: 38, y: 70, role: 'Zagueiro', color: '#e74c3c' },
                      { x: 62, y: 70, role: 'Zagueiro', color: '#e74c3c' }, { x: 85, y: 70, role: 'Lateral', color: '#e74c3c' },
                    ],
                    // 3-5-2: Com alas — 2 atacantes, 5 meias (alas), 3 zagueiros
                    '3-5-2': [
                      { x: 35, y: 15, role: 'Atacante', color: '#f1c40f' }, { x: 65, y: 15, role: 'Atacante', color: '#f1c40f' },
                      { x: 10, y: 40, role: 'Lateral', color: '#3498db' }, { x: 30, y: 42, role: 'Meio-campo', color: '#3498db' },
                      { x: 50, y: 40, role: 'Cabeça de Area', color: '#3498db' }, { x: 70, y: 42, role: 'Meio-campo', color: '#3498db' }, { x: 90, y: 40, role: 'Lateral', color: '#3498db' },
                      { x: 25, y: 70, role: 'Zagueiro', color: '#e74c3c' }, { x: 50, y: 70, role: 'Zagueiro', color: '#e74c3c' }, { x: 75, y: 70, role: 'Zagueiro', color: '#e74c3c' },
                    ],
                    // 3-4-3: Ultra ofensivo — 3 atacantes, 4 meias, 3 zagueiros
                    '3-4-3': [
                      { x: 20, y: 15, role: 'Atacante', color: '#f1c40f' }, { x: 50, y: 12, role: 'Atacante', color: '#f1c40f' }, { x: 80, y: 15, role: 'Atacante', color: '#f1c40f' },
                      { x: 15, y: 42, role: 'Lateral', color: '#3498db' }, { x: 38, y: 42, role: 'Meio-campo', color: '#3498db' },
                      { x: 62, y: 42, role: 'Cabeça de Area', color: '#3498db' }, { x: 85, y: 42, role: 'Lateral', color: '#3498db' },
                      { x: 25, y: 70, role: 'Zagueiro', color: '#e74c3c' }, { x: 50, y: 70, role: 'Zagueiro', color: '#e74c3c' }, { x: 75, y: 70, role: 'Zagueiro', color: '#e74c3c' },
                    ],
                    // 5-3-2: Defensivo com alas — 2 atacantes, 3 meias, 5 defensores
                    '5-3-2': [
                      { x: 35, y: 15, role: 'Atacante', color: '#f1c40f' }, { x: 65, y: 15, role: 'Atacante', color: '#f1c40f' },
                      { x: 25, y: 42, role: 'Meio-campo', color: '#3498db' }, { x: 50, y: 40, role: 'Cabeça de Area', color: '#3498db' }, { x: 75, y: 42, role: 'Meio-campo', color: '#3498db' },
                      { x: 10, y: 70, role: 'Lateral', color: '#e74c3c' }, { x: 30, y: 70, role: 'Zagueiro', color: '#e74c3c' },
                      { x: 50, y: 70, role: 'Zagueiro', color: '#e74c3c' }, { x: 70, y: 70, role: 'Zagueiro', color: '#e74c3c' }, { x: 90, y: 70, role: 'Lateral', color: '#e74c3c' },
                    ],
                    // 5-4-1: Ultra defensivo — 1 atacante, 4 meias, 5 defensores
                    '5-4-1': [
                      { x: 50, y: 12, role: 'Atacante', color: '#f1c40f' },
                      { x: 15, y: 40, role: 'Meio-campo', color: '#3498db' }, { x: 38, y: 42, role: 'Meio-campo', color: '#3498db' },
                      { x: 62, y: 42, role: 'Cabeça de Area', color: '#3498db' }, { x: 85, y: 40, role: 'Meio-campo', color: '#3498db' },
                      { x: 10, y: 70, role: 'Lateral', color: '#e74c3c' }, { x: 30, y: 70, role: 'Zagueiro', color: '#e74c3c' },
                      { x: 50, y: 70, role: 'Zagueiro', color: '#e74c3c' }, { x: 70, y: 70, role: 'Zagueiro', color: '#e74c3c' }, { x: 90, y: 70, role: 'Lateral', color: '#e74c3c' },
                    ],
                  };

                  const slots = F[isPastGame ? gameFormation : formation] || F['4-4-2'];
                  const gk = starterAthletes.filter(a => a.position === 'Goleiro');
                  const outfield = starterAthletes.filter(a => a.position !== 'Goleiro');
                  
                  const starterGK = gk[0];
                  const usedAthletes = new Set<string>();
                  if (starterGK) usedAthletes.add(starterGK.id);

                  // Assign athletes to slots: exact match first, then fill remaining
                  const assigned: { athlete: typeof outfield[0]; slot: Slot }[] = [];
                  const usedSlots = new Set<number>();

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

                  const bench = [...benchList, ...starterAthletes.filter(a => !usedAthletes.has(a.id))];

                  const renderPlayer = (a: typeof outfield[0], color: string, x: number, y: number) => (
                    <div key={a.id} style={{
                      position: 'absolute', left: `${x}%`, top: `${y}%`,
                      transform: 'translate(-50%, -50%)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                      transition: 'all 0.5s ease',
                      zIndex: 10
                    }}>
                      <div style={{
                        width: '34px', height: '34px', borderRadius: '50%',
                        backgroundColor: a.avatarUrl ? 'white' : color, 
                        color: color === '#f1c40f' ? '#000' : 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: '0.8rem', border: `2px solid ${color}`,
                        boxShadow: '0 4px 10px rgba(0,0,0,0.6)',
                        overflow: 'hidden'
                      }}>
                        {a.avatarUrl ? (
                          <img src={a.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          a.name.charAt(0)
                        )}
                      </div>
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
                        {teamConfig.name} vs {nextGame.opponent} — {formatDate(nextGame.date)}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
                        {/* Banco de Reservas - Lado de fora do campo */}
                        {bench.length > 0 && (
                          <div style={{
                            width: '65px',
                            backgroundColor: 'rgba(255,255,255,0.03)', 
                            borderRadius: '12px', 
                            padding: '12px 4px',
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '12px', 
                            alignItems: 'center',
                            border: '1px solid rgba(255,255,255,0.05)',
                            boxShadow: 'inset 0 0 15px rgba(0,0,0,0.2)'
                          }}>
                            <div style={{ 
                              fontSize: '0.45rem', 
                              fontWeight: '900', 
                              color: 'var(--primary)', 
                              letterSpacing: '1.5px', 
                              marginBottom: '6px', 
                              textTransform: 'uppercase',
                              writingMode: 'vertical-lr',
                              transform: 'rotate(180deg)',
                              opacity: 0.8
                            }}>Reservas</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', width: '100%', alignItems: 'center' }} className="no-scrollbar">
                              {bench.map(a => (
                                <div key={a.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                  <div style={{ 
                                    width: '28px', height: '28px', borderRadius: '50%', 
                                    border: '1.5px solid rgba(255,255,255,0.2)', overflow: 'hidden',
                                    backgroundColor: 'rgba(255,255,255,0.05)'
                                  }}>
                                    {a.avatarUrl ? (
                                      <img src={a.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                      <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>{a.name.charAt(0)}</div>
                                    )}
                                  </div>
                                  <span style={{ 
                                    fontSize: '0.4rem', color: 'var(--text-muted)', fontWeight: '600',
                                    maxWidth: '50px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                  }}>{a.name.split(' ')[0]}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Campo de Futebol */}
                        <div style={{
                          position: 'relative', flex: 1, aspectRatio: '3/4',
                          background: 'linear-gradient(180deg, #1a6b1a 0%, #228B22 50%, #2d8a2d 100%)',
                          border: '3px solid rgba(255,255,255,0.6)', borderRadius: '12px', overflow: 'hidden'
                        }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, border: '2px solid rgba(255,255,255,0.35)', margin: '8px', pointerEvents: 'none' }}></div>
                          <div style={{ position: 'absolute', top: '50%', left: '8px', right: '8px', height: '1px', backgroundColor: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}></div>
                          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '60px', height: '60px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '50%', pointerEvents: 'none' }}></div>
                          <div style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', width: '40%', height: '12%', border: '1px solid rgba(255,255,255,0.35)', borderTop: 'none', pointerEvents: 'none' }}></div>
                          <div style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', width: '40%', height: '12%', border: '1px solid rgba(255,255,255,0.35)', borderBottom: 'none', pointerEvents: 'none' }}></div>

                          {assigned.map(({ athlete, slot }) => renderPlayer(athlete, slot.color, slot.x, slot.y))}
                          {starterGK && renderPlayer(starterGK, '#f39c12', 50, 89)}
                        </div>
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
                    </>
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
                      <div className="flex items-center gap-4">
                        <div style={{ width: '56px', height: '56px', borderRadius: '50%', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                          {athlete.avatarUrl ? (
                            <img src={athlete.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <Users size={24} opacity={0.3} />
                          )}
                        </div>
                        <div>
                          <span className="badge" style={{ fontSize: '0.65rem' }}>{athlete.position}</span>
                          <h3 style={{ marginTop: '4px', marginBottom: '4px', fontSize: '1.1rem' }}>{athlete.name}</h3>
                          <div className="flex items-center gap-2 text-muted" style={{ fontSize: '0.85rem' }}>
                            <Phone size={14} />
                            <span>{athlete.phone}</span>
                          </div>
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
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem' }}>Foto do Atleta</label>
                  <div className="flex flex-col items-center gap-4" style={{ marginBottom: '20px' }}>
                    {rawImage ? (
                      <div style={{ position: 'relative', width: '100%', height: '250px', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden' }}>
                        <Cropper
                          image={rawImage}
                          crop={crop}
                          zoom={zoom}
                          aspect={1}
                          cropShape="round"
                          showGrid={false}
                          onCropChange={setCrop}
                          onZoomChange={setZoom}
                          onCropComplete={onCropComplete}
                          restrictPosition={false}
                          zoomWithScroll={true}
                        />
                      </div>
                    ) : (
                      <div style={{ 
                        width: '120px', 
                        height: '120px', 
                        borderRadius: '50%', 
                        border: '2px solid var(--primary)',
                        overflow: 'hidden',
                        backgroundColor: 'var(--surface-hover)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {newAthlete.avatarUrl ? (
                          <img src={newAthlete.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <Users size={40} className="text-muted" />
                        )}
                      </div>
                    )}
                    
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <label className="btn-secondary" style={{ flex: 1, textAlign: 'center', fontSize: '0.8rem', padding: '8px', cursor: 'pointer' }}>
                          {rawImage ? 'Trocar Foto' : 'Escolher Foto'}
                          <input 
                            type="file" 
                            accept="image/*" 
                            style={{ display: 'none' }}
                            onChange={(e) => handleFileChange(e, (base64) => setNewAthlete({...newAthlete, avatarUrl: base64}))}
                          />
                        </label>
                        {rawImage && (
                          <button 
                            type="button"
                            onClick={() => setRawImage(null)}
                            className="btn-secondary"
                            style={{ padding: '8px', color: 'var(--danger)' }}
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                      
                      {rawImage && (
                        <div style={{ padding: '0 10px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', textAlign: 'center' }}>
                            Arraste a foto para posicionar • Use o slider para o zoom
                          </label>
                          <input 
                            type="range" min="1" max="3" step="0.01" 
                            value={zoom} 
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            style={{ width: '100%', accentColor: 'var(--primary)' }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
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
            const game = games.find(g => g.id === selectedGameId);
            if (!game) { setSelectedGameId(null); return null; }
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
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={game.squad.length === athletes.length && athletes.length > 0}
                              onChange={() => toggleAllAthletesInSquad(selectedGameId)}
                              style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                              title={game.squad.length === athletes.length && athletes.length > 0 ? "Desmarcar Todos" : "Selecionar Todos"}
                            />
                            <h4 style={{ margin: 0 }}>Selecione os Atletas</h4>
                          </div>
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
                                  <div className="flex items-center gap-2">
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
                                      {athlete.avatarUrl ? (
                                        <img src={athlete.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      ) : (
                                        <Users size={16} opacity={0.3} />
                                      )}
                                    </div>
                                    <div>
                                      <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{athlete.name}</div>
                                      <div className="flex items-center gap-2" style={{ marginTop: '2px' }}>
                                      <button 
                                        onClick={() => toggleAthleteStatus(game.id, athlete.id, true)}
                                        style={{ 
                                          fontSize: '0.65rem', 
                                          padding: '2px 8px', 
                                          borderRadius: '4px', 
                                          backgroundColor: squadMember?.isStarter === true ? 'rgba(46, 204, 113, 0.2)' : 'rgba(255,255,255,0.05)',
                                          color: squadMember?.isStarter === true ? 'var(--primary)' : 'var(--text-muted)',
                                          border: squadMember?.isStarter === true ? '1px solid var(--primary)' : '1px solid var(--border)',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Titular
                                      </button>
                                      <button 
                                        onClick={() => toggleAthleteStatus(game.id, athlete.id, false)}
                                        style={{ 
                                          fontSize: '0.65rem', 
                                          padding: '2px 8px', 
                                          borderRadius: '4px', 
                                          backgroundColor: squadMember?.isStarter === false ? 'rgba(52, 152, 219, 0.2)' : 'rgba(255,255,255,0.05)',
                                          color: squadMember?.isStarter === false ? '#3498db' : 'var(--text-muted)',
                                          border: squadMember?.isStarter === false ? '1px solid #3498db' : '1px solid var(--border)',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Reserva
                                      </button>
                                    </div>
                                      <div className="text-muted" style={{ fontSize: '0.7rem', marginTop: '2px' }}>{athlete.position}</div>
                                    </div>
                                  </div>
                                </div>

                                {isInSquad && (
                                  <div className="flex items-center gap-2">
                                    <div style={{ 
                                      fontSize: '0.65rem', 
                                      padding: '2px 8px', 
                                      borderRadius: '4px', 
                                      backgroundColor: squadMember?.status === 'confirmed' ? 'rgba(46, 204, 113, 0.1)' : squadMember?.status === 'declined' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)',
                                      color: squadMember?.status === 'confirmed' ? 'var(--primary)' : squadMember?.status === 'declined' ? 'var(--danger)' : 'var(--text-muted)',
                                      fontWeight: 'bold',
                                      border: squadMember?.status === 'confirmed' ? '1px solid var(--primary)' : '1px solid transparent'
                                    }}>
                                      {squadMember?.status === 'confirmed' ? '✓ CONFIRMADO' : squadMember?.status === 'declined' ? '✕ RECUSADO' : 'PENDENTE'}
                                    </div>
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
                            )
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col gap-4" style={{ animation: 'fadeIn 0.3s ease' }}>
                        {/* Placar Estilo Estádio - Homogêneo e Simétrico */}
                        <div className="card" style={{ 
                          background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.95) 100%)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          position: 'relative',
                          overflow: 'hidden',
                          padding: '20px 12px'
                        }}>
                          <div style={{ position: 'absolute', top: '-50%', left: '50%', transform: 'translateX(-50%)', width: '200px', height: '200px', background: 'var(--primary)', filter: 'blur(100px)', opacity: 0.1, pointerEvents: 'none' }}></div>

                          <div className="flex items-center justify-between gap-1" style={{ position: 'relative', zIndex: 1 }}>
                            {/* Time da Casa */}
                            <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ width: '55px', height: '55px', marginBottom: '10px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--primary)', overflow: 'hidden', boxShadow: '0 0 12px rgba(46, 204, 113, 0.15)' }}>
                                {teamConfig.logoUrl ? (
                                  <img src={teamConfig.logoUrl} style={{ width: '80%', height: '80%', objectFit: 'contain', mixBlendMode: getBlendMode(teamConfig.logoBgType) }} />
                                ) : (
                                  <Trophy size={24} color="var(--primary)" />
                                )}
                              </div>
                              <div style={{ 
                                fontWeight: '800', 
                                fontSize: '0.65rem', 
                                color: '#fff', 
                                marginBottom: '10px', 
                                minHeight: '2.2rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                lineHeight: '1.2',
                                width: '100%',
                                padding: '0 2px'
                              }}>
                                {teamConfig.name.toUpperCase()}
                              </div>
                              <div className="flex items-center justify-center gap-1">
                                <button 
                                  onClick={() => handleUpdateGameSummary(selectedGameId, Math.max(0, (game.scoreHome || 0) - 1), game.scoreAway || 0, game.matchReport || '')}
                                  style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}
                                >-</button>
                                <div style={{ fontSize: '2rem', fontWeight: '900', color: '#fff', minWidth: '35px', fontFamily: "'Monospace', sans-serif", textAlign: 'center' }}>{game.scoreHome || 0}</div>
                                <button 
                                  onClick={() => handleUpdateGameSummary(selectedGameId, (game.scoreHome || 0) + 1, game.scoreAway || 0, game.matchReport || '')}
                                  style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--primary)', background: 'rgba(46, 204, 113, 0.1)', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}
                                >+</button>
                              </div>
                            </div>

                            {/* Separador Centralizado */}
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', marginTop: '65px' }}>
                              <div style={{ fontSize: '1rem', fontWeight: '900', color: 'var(--primary)', opacity: 0.3 }}>X</div>
                            </div>

                            {/* Time Visitante */}
                            <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ width: '55px', height: '55px', marginBottom: '10px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #e74c3c', overflow: 'hidden', boxShadow: '0 0 12px rgba(231, 76, 60, 0.15)' }}>
                                {game.opponentLogo ? (
                                  <img src={game.opponentLogo} style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: getBlendMode(game.opponentLogoBg) }} />
                                ) : (
                                  <Trophy size={24} color="#e74c3c" />
                                )}
                              </div>
                              <div style={{ 
                                fontWeight: '800', 
                                fontSize: '0.65rem', 
                                color: '#fff', 
                                marginBottom: '10px', 
                                minHeight: '2.2rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                lineHeight: '1.2',
                                width: '100%',
                                padding: '0 2px'
                              }}>
                                {game.opponent.toUpperCase()}
                              </div>
                              <div className="flex items-center justify-center gap-1">
                                <button 
                                  onClick={() => handleUpdateGameSummary(selectedGameId, game.scoreHome || 0, Math.max(0, (game.scoreAway || 0) - 1), game.matchReport || '')}
                                  style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}
                                >-</button>
                                <div style={{ fontSize: '2rem', fontWeight: '900', color: '#fff', minWidth: '35px', fontFamily: "'Monospace', sans-serif", textAlign: 'center' }}>{game.scoreAway || 0}</div>
                                <button 
                                  onClick={() => handleUpdateGameSummary(selectedGameId, game.scoreHome || 0, (game.scoreAway || 0) + 1, game.matchReport || '')}
                                  style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid #e74c3c', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}
                                >+</button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Eventos Rápidos e Relatório */}
                        <div className="card" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', padding: '20px' }}>
                          <div className="flex justify-between items-center" style={{ marginBottom: '16px' }}>
                            <div className="flex items-center gap-2">
                              <Edit2 size={18} className="text-primary" />
                              <h4 style={{ margin: 0 }}>Súmula do Jogo</h4>
                            </div>
                            <div className="flex gap-1.5">
                              <button 
                                onClick={() => {
                                  const currentReport = game.matchReport || '';
                                  const newReport = currentReport + (currentReport ? '\n' : '') + '⚽ GOL: ';
                                  handleUpdateGameSummary(selectedGameId, game.scoreHome || 0, game.scoreAway || 0, newReport);
                                }}
                                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                              >⚽ Gol</button>
                              <button 
                                onClick={() => {
                                  const currentReport = game.matchReport || '';
                                  const newReport = currentReport + (currentReport ? '\n' : '') + '🟨 CARTÃO AMARELO: ';
                                  handleUpdateGameSummary(selectedGameId, game.scoreHome || 0, game.scoreAway || 0, newReport);
                                }}
                                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255, 241, 196, 0.1)', background: 'rgba(241, 196, 15, 0.1)', color: '#f1c40f', fontSize: '0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                              >🟨 Amarelo</button>
                              <button 
                                onClick={() => {
                                  const currentReport = game.matchReport || '';
                                  const newReport = currentReport + (currentReport ? '\n' : '') + '🟥 CARTÃO VERMELHO: ';
                                  handleUpdateGameSummary(selectedGameId, game.scoreHome || 0, game.scoreAway || 0, newReport);
                                }}
                                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(231, 76, 60, 0.1)', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', fontSize: '0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                              >🟥 Vermelho</button>
                            </div>
                          </div>
                          
                          <textarea 
                            value={game.matchReport || ''} 
                            onChange={(e) => handleUpdateGameSummary(selectedGameId, game.scoreHome || 0, game.scoreAway || 0, e.target.value)}
                            placeholder="Toque nos botões acima para eventos rápidos ou digite os detalhes aqui..."
                            style={{ 
                              width: '100%', 
                              minHeight: '140px', 
                              padding: '16px', 
                              backgroundColor: 'rgba(0,0,0,0.3)', 
                              border: '1px solid var(--border)', 
                              borderRadius: '12px', 
                              color: 'var(--text)', 
                              fontSize: '0.85rem',
                              lineHeight: '1.6',
                              resize: 'vertical',
                              outline: 'none',
                              transition: 'all 0.2s'
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                            onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                          />
                          <div style={{ marginTop: '12px', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>O relatório é salvo automaticamente ao digitar.</span>
                          </div>
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
                  {(() => {
                    const today = new Date().toISOString().split('T')[0];
                    const futureGames = games.filter(g => g.date >= today);
                    if (futureGames.length === 0) {
                      return (
                        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                          <p className="text-muted">Nenhum jogo futuro marcado.</p>
                        </div>
                      );
                    }
                    return futureGames
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
                      ));
                  })()}
                </div>
              </section>

              {/* Histórico */}
              <section>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Calendar size={20} /> Histórico de Partidas
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', opacity: 0.8 }}>
                  {(() => {
                    const today = new Date().toISOString().split('T')[0];
                    const pastGames = games.filter(g => g.date < today);
                    if (pastGames.length === 0) {
                      return <p className="text-muted" style={{ paddingLeft: '20px' }}>Nenhum jogo realizado ainda.</p>;
                    }
                    return pastGames
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
                          <div className="flex items-center gap-3">
                            <div style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.75rem' }}>
                              FINALIZADO
                            </div>
                            <button onClick={() => setSelectedGameId(game.id)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Ver Detalhes</button>
                          </div>
                        </div>
                      ));
                  })()}
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
                              {game.time || '--:--'}H
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
                                {(game.location || 'LOCAL A DEFINIR').toUpperCase()}
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
        {activeTab === 'estatisticas' && (
          <div>
            <div className="flex flex-mobile-column justify-between items-center gap-4" style={{ marginBottom: '32px' }}>
              <div>
                <h1 style={{ marginBottom: '4px' }}>Estatísticas da Equipe</h1>
                <p className="text-muted">Acompanhe a artilharia, cartões e assiduidade dos atletas.</p>
              </div>
            </div>

            {(() => {
               // Calculate Attendance and Stats
               const stats: Record<string, { present: number, absent: number, goals: number, yellow: number, red: number }> = {};
               athletes.forEach(a => {
                  stats[a.id] = { present: 0, absent: 0, goals: 0, yellow: 0, red: 0 };
               });

               games.forEach(g => {
                  // Attendance
                  g.squad.forEach(s => {
                     if (stats[s.athleteId]) {
                        if (s.status === 'confirmed') stats[s.athleteId].present++;
                        if (s.status === 'declined') stats[s.athleteId].absent++;
                     }
                  });

                  // Simple Match Report parsing (Heuristic)
                  if (g.matchReport) {
                     const lines = g.matchReport.split('\n');
                     athletes.forEach(a => {
                        const firstName = a.name.split(' ')[0].toLowerCase();
                        lines.forEach(line => {
                           const lowerLine = line.toLowerCase();
                           if (lowerLine.includes(firstName)) {
                              // Count soccer ball emojis
                              const goals = (line.match(/⚽/g) || []).length;
                              if (goals > 0) stats[a.id].goals += goals;
                              
                              // Check for "gol" keyword if no emoji
                              if (goals === 0 && (lowerLine.includes('gol') || lowerLine.includes('gols'))) {
                                 const match = lowerLine.match(new RegExp(`${firstName}\\s*\\(?(\\d+)\\)?`));
                                 if (match && match[1]) {
                                    stats[a.id].goals += parseInt(match[1], 10);
                                 } else {
                                    stats[a.id].goals += 1;
                                 }
                              }

                              // Cards
                              const yellows = (line.match(/🟨/g) || []).length;
                              const reds = (line.match(/🟥/g) || []).length;
                              if (yellows > 0) stats[a.id].yellow += yellows;
                              if (reds > 0) stats[a.id].red += reds;

                              if (yellows === 0 && lowerLine.includes('amarelo')) stats[a.id].yellow += 1;
                              if (reds === 0 && lowerLine.includes('vermelho')) stats[a.id].red += 1;
                           }
                        });
                     });
                  }
               });

               const sortedByGoals = athletes.filter(a => stats[a.id]?.goals > 0).sort((a, b) => stats[b.id].goals - stats[a.id].goals);
               const activeAttendance = athletes.filter(a => stats[a.id].present > 0 || stats[a.id].absent > 0);
               const sortedByAttendance = activeAttendance.sort((a, b) => {
                  if (stats[b.id].present !== stats[a.id].present) {
                     return stats[b.id].present - stats[a.id].present; // Mais presenças no topo
                  }
                  return stats[a.id].absent - stats[b.id].absent; // Menos faltas vem primeiro em caso de empate
               });

               const sortedByCards = athletes.filter(a => stats[a.id]?.yellow > 0 || stats[a.id]?.red > 0)
                  .sort((a, b) => (stats[b.id].red * 3 + stats[b.id].yellow) - (stats[a.id].red * 3 + stats[a.id].yellow));

               return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                    {/* Artilharia */}
                    <div className="card">
                      <h3 className="flex items-center gap-2" style={{ marginBottom: '16px', color: '#f1c40f' }}>
                        <Trophy size={20} /> Artilharia
                      </h3>
                      {sortedByGoals.length === 0 ? (
                        <p className="text-muted text-center" style={{ padding: '20px 0', fontSize: '0.85rem' }}>
                          Nenhum gol registrado.<br/><br/>
                          <b>Dica:</b> Na Súmula do jogo, escreva o nome do atleta e adicione o emoji ⚽ ou a palavra "gol" (ex: "Ricardo ⚽⚽" ou "Ricardo 2 gols").
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }} className="no-scrollbar">
                          {sortedByGoals.map((a, i) => (
                            <div key={a.id} className="flex justify-between items-center" style={{ padding: '12px', backgroundColor: 'var(--surface-hover)', borderRadius: '8px' }}>
                              <div className="flex items-center gap-3">
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                  {i + 1}º
                                </div>
                                <span style={{ fontWeight: '600' }}>{a.name}</span>
                              </div>
                              <div className="flex items-center gap-1" style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#f1c40f' }}>
                                {stats[a.id].goals} ⚽
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Assiduidade */}
                    <div className="card">
                      <h3 className="flex items-center gap-2" style={{ marginBottom: '16px', color: 'var(--primary)' }}>
                        <Users size={20} /> Assiduidade
                      </h3>
                      {sortedByAttendance.length === 0 ? (
                        <p className="text-muted text-center" style={{ padding: '20px 0', fontSize: '0.85rem' }}>
                          Nenhuma presença ou falta confirmada nos jogos.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }} className="no-scrollbar">
                          {sortedByAttendance.map((a) => {
                             const s = stats[a.id];
                             const total = s.present + s.absent;
                             const pct = total > 0 ? Math.round((s.present / total) * 100) : 0;
                             return (
                                <div key={a.id} style={{ padding: '12px', backgroundColor: 'var(--surface-hover)', borderRadius: '8px' }}>
                                  <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
                                    <div className="flex items-center gap-2">
                                       <span style={{ fontWeight: '600' }}>{a.name}</span>
                                    </div>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.present} Presenças / {s.absent} Faltas</span>
                                  </div>
                                  <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: pct > 50 ? 'var(--primary)' : (pct > 0 ? '#f1c40f' : '#e74c3c') }}></div>
                                  </div>
                                </div>
                             );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Cartões */}
                    <div className="card">
                      <h3 className="flex items-center gap-2" style={{ marginBottom: '16px', color: '#e74c3c' }}>
                        <LayoutDashboard size={20} /> Cartões
                      </h3>
                      {sortedByCards.length === 0 ? (
                        <p className="text-muted text-center" style={{ padding: '20px 0', fontSize: '0.85rem' }}>
                          Nenhum cartão registrado.<br/><br/>
                          <b>Dica:</b> Na Súmula, coloque 🟨 ou 🟥 ao lado do nome, ou as palavras "amarelo" / "vermelho".
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {sortedByCards.map(a => (
                            <div key={a.id} className="flex justify-between items-center" style={{ padding: '12px', backgroundColor: 'var(--surface-hover)', borderRadius: '8px' }}>
                              <span style={{ fontWeight: '600' }}>{a.name}</span>
                              <div className="flex items-center gap-2">
                                {stats[a.id].yellow > 0 && (
                                  <div className="flex items-center gap-1" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                                    {stats[a.id].yellow} <span style={{ color: '#f1c40f' }}>🟨</span>
                                  </div>
                                )}
                                {stats[a.id].red > 0 && (
                                  <div className="flex items-center gap-1" style={{ fontSize: '0.9rem', fontWeight: 'bold', marginLeft: '8px' }}>
                                    {stats[a.id].red} <span style={{ color: '#e74c3c' }}>🟥</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
               );
            })()}
          </div>
        )}
      </main>
    </div>
  )
}
