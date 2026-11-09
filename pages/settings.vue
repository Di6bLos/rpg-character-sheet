<script setup lang="ts">
import { isHex } from '~/utils/contrast'
import { ACCENTS, THEMES, accentName, accentVars, themeMeta, type ThemeId } from '~/utils/themes'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Settings · Lantern' })

const auth = useAuthStore()
const snackbar = useSnackbarStore()
const { applySaved } = useTheme()

const theme = ref<ThemeId>(themeMeta(auth.profile?.theme).id)
// null = follow the theme's default accent
const accent = ref<string | null>(auth.profile?.accent ?? null)
const customText = ref(
  accent.value && !ACCENTS.some((a) => a.hex === accent.value) ? accent.value : '#C77DFF',
)
const notify = reactive({
  secret: auth.profile?.notify_secret ?? true,
  journal: auth.profile?.notify_journal ?? true,
  board: auth.profile?.notify_board ?? false,
})
const saving = ref(false)
const saved = ref(false)

const meta = computed(() => themeMeta(theme.value))
const activeAccent = computed(() => accent.value ?? meta.value.defaultAccent)
const customHex = computed(() => (isHex(customText.value) ? customText.value : '#C77DFF'))
const isCustom = computed(
  () => accent.value !== null && !ACCENTS.some((a) => a.hex === accent.value),
)
const previewVars = computed(() => accentVars(theme.value, activeAccent.value))

const dirty = computed(
  () =>
    theme.value !== auth.profile?.theme ||
    accent.value !== (auth.profile?.accent ?? null) ||
    notify.secret !== auth.profile?.notify_secret ||
    notify.journal !== auth.profile?.notify_journal ||
    notify.board !== auth.profile?.notify_board,
)

watch([theme, accent, notify], () => (saved.value = false), { deep: true })

function pickTheme(id: ThemeId) {
  theme.value = id
  // Presets belong to a theme's mood; a custom colour follows the player.
  if (!isCustom.value) accent.value = null
}

function onPicker(event: Event) {
  customText.value = (event.target as HTMLInputElement).value.toUpperCase()
  accent.value = customText.value
}

function onHexInput(event: Event) {
  let value = (event.target as HTMLInputElement).value.trim()
  if (value && value[0] !== '#') value = '#' + value
  customText.value = value
  if (isHex(value)) accent.value = value.toUpperCase()
}

async function save() {
  saving.value = true
  try {
    await auth.updateProfile({
      theme: theme.value,
      accent: accent.value,
      notify_secret: notify.secret,
      notify_journal: notify.journal,
      notify_board: notify.board,
    })
    applySaved()
    saved.value = true
    snackbar.show('Your look is saved')
  } catch (err) {
    snackbar.error(err, 'Could not save your settings')
  } finally {
    saving.value = false
  }
}

const toggles = [
  { key: 'secret', label: 'Secret messages from the GM' },
  { key: 'journal', label: 'New journal entries in my campaigns' },
  { key: 'board', label: 'Maps and images added to the board' },
] as const
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1>Settings</h1>
        <p>Your look follows you to every screen. Other players keep their own.</p>
      </div>
      <div class="row">
        <button
          type="button"
          class="btn btn--ghost"
          :disabled="accent === null"
          @click="accent = null"
        >
          Reset to theme default
        </button>
        <button type="button" class="btn" :disabled="saving || !dirty" @click="save">
          {{ saving ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save changes' }}
        </button>
      </div>
    </header>

    <div class="settings">
      <div class="stack settings__main">
        <section class="panel" aria-labelledby="theme-h">
          <div class="panel-title">
            <h2 id="theme-h">Theme</h2>
            <span class="small muted">Changes fonts, textures and surfaces.</span>
          </div>
          <div class="themes">
            <button
              v-for="t in THEMES"
              :key="t.id"
              type="button"
              class="theme-card"
              :aria-pressed="theme === t.id"
              @click="pickTheme(t.id)"
            >
              <span
                class="theme-card__swatch"
                :style="{ background: t.swatchBg, color: t.swatchText, fontFamily: t.display }"
              >
                Aa
                <i :style="{ background: t.defaultAccent }" />
              </span>
              <span class="theme-card__name">{{ t.name }}</span>
              <span class="small muted">{{ t.desc }}</span>
            </button>
          </div>
        </section>

        <section class="panel" aria-labelledby="accent-h">
          <div class="panel-title">
            <h2 id="accent-h">Accent colour</h2>
            <span class="small muted">
              Used for buttons, level seals, health bars and highlights.
            </span>
          </div>
          <div class="swatches" role="radiogroup" aria-labelledby="accent-h">
            <button
              v-for="sw in ACCENTS"
              :key="sw.id"
              type="button"
              role="radio"
              class="swatch"
              :aria-checked="accent === sw.hex"
              @click="accent = sw.hex"
            >
              <span class="swatch__dot" :style="{ background: sw.hex }" />
              <span class="swatch__text">
                <strong>{{ sw.name }}</strong>
                <span class="small muted">{{ sw.hex }}</span>
              </span>
            </button>
          </div>

          <div class="custom" :class="{ 'is-on': isCustom }">
            <div class="grow">
              <h3>Custom colour</h3>
              <p class="small muted">
                Pick any colour. Text on it switches to light or dark to stay readable.
              </p>
            </div>
            <input
              type="color"
              class="custom__picker"
              aria-label="Custom accent colour"
              :value="customHex"
              @input="onPicker"
            />
            <div class="field custom__hex">
              <label for="accent-hex">Hex</label>
              <input
                id="accent-hex"
                class="input"
                type="text"
                maxlength="7"
                spellcheck="false"
                :value="customText"
                @input="onHexInput"
              />
            </div>
            <button
              type="button"
              class="btn btn--ghost"
              :aria-pressed="isCustom"
              @click="accent = customHex.toUpperCase()"
            >
              {{ isCustom ? 'Using custom' : 'Use custom' }}
            </button>
          </div>
        </section>

        <section class="panel" aria-labelledby="notif-h">
          <div class="panel-title">
            <h2 id="notif-h">Notifications</h2>
          </div>
          <UiSwitch
            v-for="tg in toggles"
            :key="tg.key"
            v-model="notify[tg.key]"
            :label="tg.label"
          />
        </section>
      </div>

      <aside class="settings__preview" aria-label="Live preview">
        <div class="eyebrow">Live preview</div>
        <div class="preview" :data-theme="theme" :style="previewVars">
          <div class="panel preview__card">
            <div class="row">
              <div class="seal"><strong>5</strong><span>lvl</span></div>
              <div>
                <div class="preview__name">Thessaly Vane</div>
                <div class="small muted">Half-Elf Ranger</div>
              </div>
            </div>
            <div>
              <div class="row preview__hp">
                <span class="small muted">Hit points</span>
                <strong>38 / 44</strong>
              </div>
              <div class="bar"><span style="width: 86%" /></div>
            </div>
            <div class="row">
              <span class="btn btn--sm">Level up</span>
              <span class="btn btn--ghost btn--sm">Roll 1d8+4</span>
            </div>
            <p class="preview__msg"><strong>Mara (GM):</strong> The vault doors groan open.</p>
          </div>
        </div>
        <p class="small muted">
          Theme: <strong>{{ meta.name }}</strong> · Accent:
          <strong>{{ accentName(activeAccent) }}</strong>
        </p>
      </aside>
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 24px;
  align-items: start;
}

.settings__preview {
  position: sticky;
  top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.themes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  text-align: left;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: min(var(--radius-panel), 14px);

  &[aria-pressed='true'] {
    border: 2px solid var(--accent-text);
    padding: 9px;
    box-shadow: 0 0 0 3px var(--accent-tint);
  }
}

.theme-card__swatch {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 84px;
  margin-bottom: 6px;
  font-size: 30px;
  border-radius: 6px;
  overflow: hidden;

  i {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 6px;
  }
}

.theme-card__name {
  font-weight: 600;
}

.swatches {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

.swatch {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 12px;
  text-align: left;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: min(var(--radius-control), 12px);

  &[aria-checked='true'] {
    border: 2px solid var(--accent-text);
    padding: 7px 11px;
    box-shadow: 0 0 0 3px var(--accent-tint);
  }
}

.swatch__dot {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
}

.swatch__text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.custom {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
  margin-top: 20px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: min(var(--radius-panel), 14px);

  &.is-on {
    border-color: var(--accent-text);
    box-shadow: 0 0 0 3px var(--accent-tint);
  }

  h3 {
    font-size: 16px;
  }
}

.custom__picker {
  width: 56px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: none;
  cursor: pointer;
}

.custom__hex {
  width: 120px;
}

.preview {
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--page-bg);
  background-color: var(--page-base);
  color: var(--page-text);
  font-family: var(--font-body);
}

.preview__card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
}

.preview__name {
  font-family: var(--font-heading);
  font-size: 20px;
  font-weight: 600;
}

.preview__hp {
  justify-content: space-between;
  margin-bottom: 6px;
}

.preview__msg {
  font-size: 14px;
  padding: 10px 12px;
  background: var(--accent-tint);
  border-left: 3px solid var(--accent);
}

.seal {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;

  strong {
    font-family: var(--font-heading);
    font-size: 22px;
  }

  span {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
}

.bar {
  height: 10px;
  background: var(--track);
  border-radius: 999px;
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
}

@media (max-width: 900px) {
  .settings {
    grid-template-columns: 1fr;
  }

  .settings__preview {
    position: static;
  }
}
</style>
