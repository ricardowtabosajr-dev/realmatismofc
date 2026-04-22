export type PlayerPosition = 'Goleiro' | 'Zagueiro' | 'Lateral' | 'Meio-campo' | 'Atacante';

export interface Athlete {
  id: string;
  name: string;
  position: PlayerPosition;
  phone: string;
}

export interface Game {
  id: string;
  opponent: string;
  opponentLogo?: string;
  opponentLogoBg?: 'dark' | 'light';
  date: string;
  time: string;
  location: string;
  fee: number;
  squad: SquadEntry[];
}

export interface SquadEntry {
  athleteId: string;
  paid: boolean;
}

export interface TeamConfig {
  name: string;
  logoUrl?: string;
  logoBgType?: 'dark' | 'light';
  pixKey?: string;
}
