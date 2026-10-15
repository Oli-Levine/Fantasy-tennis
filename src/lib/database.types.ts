/**
 * Types for the Supabase database, matching supabase/migrations/*.sql.
 * Hand-written (the Supabase CLI can't reach the project from cloud sessions);
 * keep in sync when the schema changes.
 */

type Timestamp = string;
type Uuid = string;

export type Role = "user" | "admin";
export type RuleType = "tick" | "count";
export type RuleCategory = "match" | "other";
export type GameweekStatus = "open" | "locked" | "published";
export type Chip = "triple_captain" | "free_hit" | "wildcard";

type Table<Row, Required extends keyof Row = never, Relationships = []> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

export type ClubSettings = {
  id: boolean;
  season_name: string;
  budget: number;
  free_transfers_per_gameweek: number;
  transfer_hit_points: number;
  updated_at: Timestamp;
};

export type Profile = {
  id: Uuid;
  display_name: string;
  team_name: string | null;
  role: Role;
  joined_at: Timestamp | null;
  is_test_data: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type Player = {
  id: Uuid;
  name: string;
  club_team: number;
  price: number;
  photo_path: string | null;
  is_active: boolean;
  is_test_data: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type ScoringRule = {
  id: Uuid;
  name: string;
  points: number;
  type: RuleType;
  category: RuleCategory;
  sort_order: number;
  archived_at: Timestamp | null;
  is_test_data: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type Gameweek = {
  id: number;
  number: number;
  deadline: Timestamp;
  status: GameweekStatus;
  is_blank: boolean;
  locked_at: Timestamp | null;
  published_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type SquadPick = {
  user_id: Uuid;
  position: number;
  player_id: Uuid;
  is_captain: boolean;
  is_vice_captain: boolean;
  updated_at: Timestamp;
};

export type ChipPlay = {
  user_id: Uuid;
  chip: Chip;
  gameweek_id: number;
  created_at: Timestamp;
};

export type Transfer = {
  id: number;
  user_id: Uuid;
  gameweek_id: number;
  player_out_id: Uuid;
  player_in_id: Uuid;
  is_free: boolean;
  created_at: Timestamp;
};

export type GameweekEntry = {
  user_id: Uuid;
  gameweek_id: number;
  chip: Chip | null;
  transfers_made: number;
  transfer_hit: number;
  points: number | null;
  created_at: Timestamp;
};

export type GameweekPick = {
  user_id: Uuid;
  gameweek_id: number;
  position: number;
  player_id: Uuid;
  is_captain: boolean;
  is_vice_captain: boolean;
};

export type PlayerGameweek = {
  gameweek_id: number;
  player_id: Uuid;
  did_not_play: boolean;
  points: number | null;
  updated_at: Timestamp;
};

export type RuleResult = {
  gameweek_id: number;
  player_id: Uuid;
  rule_id: Uuid;
  count: number;
  updated_at: Timestamp;
};

export type Database = {
  public: {
    Tables: {
      club_settings: Table<ClubSettings>;
      profiles: Table<Profile, "id" | "display_name">;
      players: Table<Player, "name" | "club_team" | "price">;
      scoring_rules: Table<ScoringRule, "name" | "points" | "type" | "category">;
      gameweeks: Table<Gameweek, "number" | "deadline">;
      squad_picks: Table<SquadPick, "user_id" | "position" | "player_id">;
      chip_plays: Table<ChipPlay, "user_id" | "chip" | "gameweek_id">;
      transfers: Table<Transfer, "user_id" | "gameweek_id" | "player_out_id" | "player_in_id" | "is_free">;
      gameweek_entries: Table<GameweekEntry, "user_id" | "gameweek_id">;
      gameweek_picks: Table<GameweekPick, "user_id" | "gameweek_id" | "position" | "player_id">;
      player_gameweeks: Table<PlayerGameweek, "gameweek_id" | "player_id">;
      rule_results: Table<RuleResult, "gameweek_id" | "player_id" | "rule_id" | "count">;
    };
    Views: { [_ in never]: never };
    Functions: {
      is_member: { Args: never; Returns: boolean };
      is_admin: { Args: never; Returns: boolean };
      join_club: { Args: { p_code: string }; Returns: boolean };
      get_join_code: { Args: never; Returns: string };
      set_join_code: { Args: { p_code: string }; Returns: string };
      set_user_role: { Args: { p_user_id: Uuid; p_role: Role }; Returns: undefined };
      remove_user: { Args: { p_user_id: Uuid }; Returns: undefined };
      sync_gameweeks: { Args: never; Returns: number };
      save_squad: {
        Args: {
          p_picks: { position: number; player_id: Uuid; is_captain: boolean; is_vice_captain: boolean }[];
        };
        Returns: { changed_players: boolean };
      };
      admin_generate_gameweeks: { Args: { p_first_date: string; p_weeks: number }; Returns: number };
      admin_list_users: {
        Args: never;
        Returns: {
          id: Uuid;
          email: string;
          display_name: string;
          team_name: string | null;
          role: Role;
          joined_at: Timestamp | null;
          created_at: Timestamp;
          last_sign_in_at: Timestamp | null;
          is_test_data: boolean;
        }[];
      };
      admin_test_data_counts: {
        Args: never;
        Returns: { players: number; scoring_rules: number; managers: number };
      };
      admin_delete_test_data: {
        Args: never;
        Returns: { players: number; scoring_rules: number; managers: number };
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
