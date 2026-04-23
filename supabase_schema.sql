-- Script para configurar o banco de dados no Supabase SQL Editor

-- 1. Tabela de Posições
CREATE TABLE IF NOT EXISTS public.positions (
    name TEXT PRIMARY KEY
);

-- Inserir posições padrão
INSERT INTO public.positions (name) VALUES 
('Goleiro'), ('Zagueiro'), ('Lateral'), ('Meio-campo'), ('Atacante')
ON CONFLICT DO NOTHING;

-- 2. Tabela de Atletas
CREATE TABLE IF NOT EXISTS public.athletes (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    position TEXT REFERENCES public.positions(name),
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabela de Jogos
CREATE TABLE IF NOT EXISTS public.games (
    id UUID PRIMARY KEY,
    opponent TEXT NOT NULL,
    opponent_logo TEXT,
    opponent_logo_bg TEXT,
    date DATE NOT NULL,
    time TEXT,
    location TEXT,
    fee NUMERIC DEFAULT 0,
    score_home INTEGER,
    score_away INTEGER,
    match_report TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabela de Convocação (Squad)
CREATE TABLE IF NOT EXISTS public.squad_entries (
    game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
    athlete_id UUID REFERENCES public.athletes(id) ON DELETE CASCADE,
    paid BOOLEAN DEFAULT false,
    PRIMARY KEY (game_id, athlete_id)
);

-- 5. Configuração do Time
CREATE TABLE IF NOT EXISTS public.team_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT 'RealMatismo',
    logo_url TEXT,
    logo_bg_type TEXT,
    pix_key TEXT,
    manager_phone TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Inserir configuração inicial
INSERT INTO public.team_config (id, name) VALUES (1, 'RealMatismo') ON CONFLICT DO NOTHING;

-- Habilitar RLS (Opcional, mas recomendado)
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all" ON public.positions FOR ALL USING (true);

ALTER TABLE public.athletes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all" ON public.athletes FOR ALL USING (true);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all" ON public.games FOR ALL USING (true);

ALTER TABLE public.squad_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all" ON public.squad_entries FOR ALL USING (true);

ALTER TABLE public.team_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all" ON public.team_config FOR ALL USING (true);
