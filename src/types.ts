export type PlayerPosition = string;
export const DEFAULT_POSITIONS = ['Goleiro', 'Zagueiro', 'Lateral', 'Meio-campo', 'Atacante'] as const;


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
  scoreHome?: number;
  scoreAway?: number;
  matchReport?: string;
}

export interface SquadEntry {
  athleteId: string;
  paid: boolean;
  status?: 'confirmed' | 'declined' | 'pending';
}

export interface TeamConfig {
  name: string;
  logoUrl?: string;
  logoBgType?: 'dark' | 'light';
  pixKey?: string;
  managerPhone?: string;
}
