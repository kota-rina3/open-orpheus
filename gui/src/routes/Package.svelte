<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { getBridge } from "$lib/bridge";
  import type { ManageContract } from "$bridge/manage-api";

  const api = getBridge<ManageContract>("manage");

  import versions from "../../../versions.json";
</script>

<h1 class="text-2xl font-bold">资源包</h1>
<p class="mt-2 text-gray-700">
  一个 Open Orpheus 版本仅为一个特定的资源包版本设计，因此推荐使用与当前 Open
  Orpheus 版本匹配的资源包版本以获得最佳体验。
</p>
<p class="mt-4 text-gray-700">
  {#await api.pack.getWebPackCommitHash()}
    推荐资源包版本：{versions.commit}
  {:then commitHash}
    当前资源包版本：{commitHash}{#if commitHash === versions.commit}（已是推荐版本）{:else}（推荐使用
      {versions.commit}）{/if}
  {/await}
</p>
<!-- TODO: redownload -->
<Button class="mt-4" disabled>重新下载资源包</Button>
