<script lang="ts">
  import * as RadioGroup from "$lib/components/ui/radio-group";
  import * as Field from "$lib/components/ui/field";

  import * as settings from "$lib/settings";

  let overrideMainWindowSizeLimitPromise = $state(
    settings.get("window.overrideMainWindowSizeLimit")
  );
</script>

<h1 class="text-2xl font-bold">窗口设置</h1>
<p class="mt-2 text-gray-700">选择主窗口大小限制的行为。</p>

{#await overrideMainWindowSizeLimitPromise then value}
  <RadioGroup.Root
    class="mt-2"
    bind:value={
      () => (value as string) || "false",
      (v) => {
        settings.set("window.overrideMainWindowSizeLimit", v);
        overrideMainWindowSizeLimitPromise = Promise.resolve(v);
      }
    }
  >
    <Field.Label for="main-window-size-limit-false">
      <Field.Field orientation="horizontal">
        <Field.Content>
          <Field.Title>正常应用限制</Field.Title>
          <Field.Description>
            主窗口将遵循网易云音乐设置的大小限制。
          </Field.Description>
        </Field.Content>
        <RadioGroup.Item id="main-window-size-limit-false" value="false" />
      </Field.Field>
    </Field.Label>
    <Field.Label for="main-window-size-limit-true">
      <Field.Field orientation="horizontal">
        <Field.Content>
          <Field.Title>不应用限制</Field.Title>
          <Field.Description>主窗口将没有大小限制。</Field.Description>
        </Field.Content>
        <RadioGroup.Item id="main-window-size-limit-true" value="true" />
      </Field.Field>
    </Field.Label>
  </RadioGroup.Root>
{/await}
