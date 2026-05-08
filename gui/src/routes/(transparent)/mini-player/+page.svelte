<script lang="ts">
  import { onMount } from "svelte";

  import * as Popover from "$lib/components/ui/popover";
  import { Slider } from "$lib/components/ui/slider";

  import { inputRegionAttachment } from "$lib/inputRegion";

  import { getBridge } from "$lib/bridge";

  import IconButton from "$lib/components/IconButton.svelte";

  import type {
    MiniPlayerContract,
    MiniPlayerFullState,
    MiniPlayerPlayInfo,
    MiniPlayerPlayState,
    MiniPlayerListData,
    MiniPlayerStyle,
  } from "$bridge/contracts/mini-player-api";

  const api = getBridge<MiniPlayerContract>("miniPlayer");

  let playInfo = $state<MiniPlayerPlayInfo | null>(null);
  let coverUrl = $state<string | null>(null);
  let likeMark = $state(false);
  let playState = $state<MiniPlayerPlayState>({ playing: false });
  let listData = $state<MiniPlayerListData>({ items: [], currentPlay: null });
  let style = $state<MiniPlayerStyle | null>(null);

  function applyFullState(state: MiniPlayerFullState) {
    playInfo = state.playInfo;
    coverUrl = state.coverUrl;
    likeMark = state.likeMark;
    playState = state.playState;
    listData = { items: state.listItems, currentPlay: state.currentPlay };
    style = state.style;
  }

  onMount(async () => {
    api.events.playInfoUpdate((info) => {
      playInfo = info;
    });
    api.events.coverUpdate((url) => {
      coverUrl = url;
    });
    api.events.likeUpdate((liked) => {
      likeMark = liked;
    });
    api.events.playStateUpdate((state) => {
      playState = state;
    });
    api.events.listUpdate((data) => {
      listData = data;
    });
    api.events.showVolume((data) => {
      volume = data[0] * 100;
      showVolumeBar = true;
    });
    api.events.styleUpdate((newStyle) => {
      style = newStyle;
    });
    api.events.fullStateUpdate(applyFullState);

    const state = await api.requestFullUpdate();
    if (state) {
      applyFullState(state);
    }
  });

  let showList = $state(false);
  let showVolumeBar = $state(false);
  let volume = $state(100);
  //let muted = $state(false);
  let volumeButtonEl: HTMLElement | undefined = $state(undefined);

  function noPropagation(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }
</script>

<Popover.Root bind:open={showVolumeBar}>
  <Popover.Content
    class="max-w-36"
    customAnchor={volumeButtonEl}
    {@attach inputRegionAttachment}
  >
    <Slider
      type="single"
      bind:value={
        () => volume,
        (v) => (
          (volume = v),
          api.fireCall("player.onminivolumechange", volume / 100)
        )
      }
      min={0}
      max={100}
      step={1}
    />
  </Popover.Content>
</Popover.Root>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="flex h-12.5 items-center gap-2"
  style:background={style?.background}
  onmousedown={(e) => {
    if (e.button != 0) return; // Only left button
    e.preventDefault();
    api.dragWindow();
  }}
  oncontextmenu={(e) => {
    e.preventDefault();
    api.fireCall("player.oncontextmenu");
  }}
  {@attach inputRegionAttachment}
>
  {#if coverUrl}
    <button
      class="cursor-pointer"
      onmousedown={noPropagation}
      onclick={() => api.fireCall("player.onrequestchangetomain", "")}
    >
      <img src={coverUrl} alt="Cover" class="size-12.5" />
    </button>
  {/if}
  <div class="group relative flex flex-1 items-center justify-center gap-2">
    {#if playInfo}
      <div
        class="absolute top-0 right-0 bottom-0 left-0 z-10 flex flex-col justify-center text-center text-sm whitespace-nowrap group-hover:hidden"
        style:background={style?.background}
      >
        <p
          class="overflow-hidden text-ellipsis"
          style:color={style?.titleColor}
        >
          {playInfo.songName}
        </p>
        <p
          class="overflow-hidden text-ellipsis"
          style:color={style?.artistColor}
        >
          {playInfo.artistName}
        </p>
      </div>
    {/if}
    <IconButton
      class="size-6 cursor-pointer"
      imgClass="size-full"
      images={style?.prevButton}
      onmousedown={noPropagation}
      onclick={() => api.fireCall("player.onaction", "prev", "miniPlayer")}
    />
    <IconButton
      class="size-10 cursor-pointer"
      imgClass="size-full"
      images={playState.playing ? style?.pauseButton : style?.playButton}
      onmousedown={noPropagation}
      onclick={() =>
        api.fireCall(
          "player.onaction",
          playState.playing ? "pause" : "play",
          "miniPlayer"
        )}
    />
    <IconButton
      class="size-6 cursor-pointer"
      imgClass="size-full"
      images={style?.nextButton}
      onmousedown={noPropagation}
      onclick={() => api.fireCall("player.onaction", "next", "miniPlayer")}
    />
  </div>
  <IconButton
    class="size-6 cursor-pointer"
    imgClass="size-full"
    images={likeMark ? style?.lovedButton : style?.loveButton}
    onmousedown={noPropagation}
    onclick={() => api.fireCall("player.onlikeclick", "normal")}
  />
  <IconButton
    bind:element={volumeButtonEl}
    class="size-6 cursor-pointer"
    imgClass="size-full"
    images={style?.volumeButton}
    onmousedown={noPropagation}
    onclick={() =>
      showVolumeBar
        ? (showVolumeBar = false)
        : api.fireCall("player.onaction", "volume", "miniPlayer")}
  />
  <IconButton
    class="size-4 cursor-pointer"
    imgClass="size-full"
    images={style?.listButton}
    onmousedown={noPropagation}
    onclick={() => (showList = !showList)}
  />
  <div class="flex h-full flex-col gap-0.5 p-1">
    <IconButton
      class="size-2.5 cursor-pointer"
      imgClass="size-full"
      images={style?.closeButton}
      onmousedown={noPropagation}
      onclick={() => api.fireCall("player.onrequestclose", "")}
    />
    <IconButton
      class="size-2.5 cursor-pointer"
      imgClass="size-full"
      images={style?.toWebButton}
      onmousedown={noPropagation}
      onclick={() => api.fireCall("player.onrequestchangetomain", "")}
    />
  </div>
</div>
<div
  class="playlist invisible h-85 overflow-y-auto"
  style:background={style?.list.background}
  style:--scrollbar-bg={style?.list.background}
  style:--scrollbar-thumb={style?.list.scrollBar}
  class:visible={showList}
  {@attach showList && inputRegionAttachment}
>
  {#if listData.items.length > 0}
    <ul
      class="text-xs"
      style:--item-bg={style?.list.itemBackground}
      style:--hover-bg={style?.list.hoverBackground}
      style:--selected-bg={style?.list.selectedBackground}
      style:--playing-bg={style?.list.playingBackground}
      style:color={style?.list.color}
      style:--hover-color={style?.list.hoverColor}
      style:--selected-color={style?.list.selectedColor}
    >
      {#each listData.items as item (item.id)}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <li
          tabindex="0"
          class="flex h-8.5 items-center select-none even:bg-(--item-bg) hover:bg-(--hover-bg) focus:bg-(--selected-bg){item.id ===
          listData.currentPlay
            ? ' bg-(--playing-bg)!'
            : ''} hover:text-(--hover-color) focus:text-(--selected-color)"
          ondblclick={() => api.fireCall("player.onrequestplay", item.id)}
          oncontextmenu={() => api.fireCall("player.onmenu", item.id)}
        >
          <div class="flex size-6 items-center justify-center">
            {#if item.id === listData.currentPlay}
              <IconButton
                images={playState.playing
                  ? style?.list.playButton
                  : style?.list.pauseButton}
                imgClass="size-4"
              />
            {/if}
          </div>
          <p>{item.title}</p>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style lang="scss">
  .playlist::-webkit-scrollbar {
    width: 8px;
  }
  .playlist::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
  }
</style>
