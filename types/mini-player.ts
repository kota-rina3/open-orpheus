import type { BtnImages } from "./dui";

export interface MiniPlayerPlayInfo {
  albumId: string;
  albumName: string;
  artistName: string;
  playId: string;
  songName: string;
  songType: string;
  url: string;
}

export interface MiniPlayerPlayState {
  playing: boolean;
}

export interface MiniPlayerListElement {
  id: string;
  from: string;
  title: string;
  track_id: string;
  program: null;
  mv: string;
  album: string;
  artist: string;
  alias: string;
  cloud: 0 | 1;
}

export interface MiniPlayerListData {
  items: MiniPlayerListElement[];
  currentPlay: string | null;
}

export interface MiniPlayerFullState {
  playInfo: MiniPlayerPlayInfo | null;
  coverUrl: string | null;
  likeMark: boolean;
  currentPlay: string | null;
  playState: MiniPlayerPlayState;
  listItems: MiniPlayerListElement[];
  style: MiniPlayerStyle | null;
}

export interface MiniPlayerStyle {
  background: string;

  titleColor: string;
  artistColor: string;

  prevButton: BtnImages;
  playButton: BtnImages;
  pauseButton: BtnImages;
  nextButton: BtnImages;

  loveButton: BtnImages;
  lovedButton: BtnImages;

  volumeButton: BtnImages;
  volumeMutedButton: BtnImages;

  listButton: BtnImages;

  closeButton: BtnImages;
  toWebButton: BtnImages;

  list: {
    background: string;
    itemBackground: string;
    hoverBackground: string;
    selectedBackground: string;
    playingBackground: string;
    scrollBar: string;

    playButton: BtnImages;
    pauseButton: BtnImages;

    color: string;
    hoverColor: string;
    selectedColor: string;
  };
}

export type MiniPlayerShowVolumeRequest = [number, boolean];
