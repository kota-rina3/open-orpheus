export interface BtnState {
  uri: string;
  color?: string;
}

export interface BtnImages {
  normal: BtnState;
  hot?: BtnState;
  pushed?: BtnState;
  disabled?: BtnState;
}
