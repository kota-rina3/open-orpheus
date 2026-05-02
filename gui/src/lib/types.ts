export interface LyricWord {
  text: string;
  start_time: number;
  duration: number;
}

export interface LyricLine {
  start_time: number;
  end_time: number;
  words: LyricWord[];
}

export interface LyricsData {
  lines: LyricLine[];
  secondary_lines?: LyricLine[];
}

export type TextAlignType = "left" | "center" | "right";

export interface LyricStyleConfig {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  textAlign: [TextAlignType, TextAlignType];
  lineMode: boolean;
  vertical: boolean;
  colorNotPlayedTop: string;
  colorNotPlayedBottom: string;
  colorPlayedTop: string;
  colorPlayedBottom: string;
  outlineColorNotPlayed: string;
  outlineColorPlayed: string;
  dropShadow: string;
  showProgress: boolean;
  offset: number;
  slogan: string;
}

export interface MenuSkin {
  background: string;
  foreground: string;
  foregroundDisabled: string;
  separator: string;
  itemHover: string;
}
