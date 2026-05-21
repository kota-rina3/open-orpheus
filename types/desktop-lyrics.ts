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
  showTranslate: "translate" | "roman";
}
