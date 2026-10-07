import {
  CalendarBlankIcon,
  ClipboardTextIcon,
  PlusIcon,
  StackIcon,
  SunIcon,
  UsersIcon,
  WalletIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { ListSkeleton } from '#/components/list-skeleton'
import { useSubmit } from '#/components/money/use-submit'
import { SettingsPage } from '#/components/settings/settings-page'
import { Flash, SettingsPreview } from '#/components/settings/settings-preview'
import { Button } from '#/components/ui/button'
import { Panel, PanelBody } from '#/components/panel'
import { Field, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'
import { guessPlural, isValidWord } from '../../../shared/words'
import type { Words } from '../../../shared/words'

export const Route = createFileRoute('/_app/settings/names')({
  component: NamesSettings,
})

const KEYS: Array<{
  key: keyof Words
  label: () => string
  about: () => string
  icon: Icon
}> = [
  {
    key: 'client',
    label: m.names_word_client,
    about: m.names_about_client,
    icon: UsersIcon,
  },
  {
    key: 'job',
    label: m.names_word_job,
    about: m.names_about_job,
    icon: ClipboardTextIcon,
  },
  {
    key: 'item',
    label: m.names_word_item,
    about: m.names_about_item,
    icon: StackIcon,
  },
  {
    key: 'appointment',
    label: m.names_word_appointment,
    about: m.names_about_appointment,
    icon: CalendarBlankIcon,
  },
]

function NamesSettings() {
  const { business } = useViewer()
  const settings = useQuery(api.businesses.settings, {
    businessId: business._id,
  })
  if (!settings) {
    return (
      <SettingsPage title={m.settings_names()} help={m.names_help()}>
        <ListSkeleton />
      </SettingsPage>
    )
  }
  return (
    <NamesForm
      initial={settings.words}
      items={settings.modules.items}
      owner={settings.role === 'owner'}
    />
  )
}

function NamesForm({
  initial,
  items,
  owner,
}: {
  initial: Words
  items: boolean
  owner: boolean
}) {
  const { business } = useViewer()
  const setWords = useMutation(api.businesses.setWords)
  const { busy, run } = useSubmit()
  const [words, setDraft] = useState<Words>(initial)
  const valid = KEYS.every(({ key }) => isValidWord(words[key]))
  const change = (key: keyof Words, patch: Partial<Words[keyof Words]>) =>
    setDraft({ ...words, [key]: { ...words[key], ...patch } })

  return (
    <SettingsPage
      title={m.settings_names()}
      help={m.names_help()}
      previewWideOnly
      preview={
        <SettingsPreview>
          <AppPreview words={words} items={items} />
        </SettingsPreview>
      }
    >
      <form
        className="flex flex-col gap-4 px-4"
        onSubmit={(event) => {
          event.preventDefault()
          void run(() => setWords({ businessId: business._id, words }))
        }}
      >
        <fieldset disabled={!owner} className="contents">
          {KEYS.map(({ key, label, about, icon }) => (
            <Panel key={key} title={label()} icon={icon} className="mx-0">
              {/* A named group, so "Едно" and "Много" say which word they are. */}
              <PanelBody
                role="group"
                aria-label={label()}
                className="flex flex-col gap-4"
              >
                <p className="text-sm text-muted-foreground">{about()}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor={`${key}-singular`}>
                      {m.names_singular()}
                    </FieldLabel>
                    <Input
                      id={`${key}-singular`}
                      maxLength={40}
                      value={words[key].singular}
                      onChange={(event) => {
                        const singular = event.target.value
                        const guessed =
                          guessPlural(words[key].singular) === words[key].plural
                        change(
                          key,
                          guessed
                            ? { singular, plural: guessPlural(singular) }
                            : { singular },
                        )
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${key}-plural`}>
                      {m.names_plural()}
                    </FieldLabel>
                    <Input
                      id={`${key}-plural`}
                      maxLength={40}
                      value={words[key].plural}
                      onChange={(event) =>
                        change(key, { plural: event.target.value })
                      }
                    />
                  </Field>
                </div>
                <Preview word={words[key]} />
              </PanelBody>
            </Panel>
          ))}
          <Button type="submit" size="xl" disabled={busy || !valid}>
            {busy && <Spinner data-icon="inline-start" />}
            {m.save()}
          </Button>
        </fieldset>
      </form>
    </SettingsPage>
  )
}

/**
 * The places the words show most, drawn from the words being typed: the main
 * menu, the "+" button, and a client's page with its jobs, items and
 * appointments.
 */
function AppPreview({ words, items }: { words: Words; items: boolean }) {
  const shown = (word: Words[keyof Words]) =>
    word.singular.trim() && word.plural.trim() ? word : null
  const job = shown(words.job) ?? initialWord(words.job)
  const client = shown(words.client) ?? initialWord(words.client)
  const item = shown(words.item) ?? initialWord(words.item)
  const appointment = shown(words.appointment) ?? initialWord(words.appointment)
  const nav: Array<{ icon: Icon; label: string; watch?: unknown }> = [
    { icon: SunIcon, label: m.nav_today() },
    { icon: ClipboardTextIcon, label: job.plural, watch: job.plural },
    { icon: UsersIcon, label: client.plural, watch: client.plural },
    { icon: WalletIcon, label: m.nav_money() },
  ]
  const row =
    'flex min-h-9 items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-sm'
  return (
    <div className="flex flex-col gap-3">
      <Flash watch={job.singular}>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
          <PlusIcon aria-hidden weight="bold" className="size-4" />
          {job.singular}
        </span>
      </Flash>
      <div className="flex flex-col gap-1.5">
        <p className="text-base font-semibold tracking-tight">
          {m.names_preview_client_name()}
        </p>
        <Flash watch={job.plural}>
          <div className={row}>
            <ClipboardTextIcon aria-hidden className="size-4 shrink-0" />
            <span className="font-medium">
              {m.count({ label: job.plural, count: 3 })}
            </span>
          </div>
        </Flash>
        {items && (
          <Flash watch={item.plural}>
            <div className={row}>
              <StackIcon aria-hidden className="size-4 shrink-0" />
              <span className="font-medium">
                {m.count({ label: item.plural, count: 2 })}
              </span>
            </div>
          </Flash>
        )}
        <Flash watch={appointment.singular}>
          <div className={row}>
            <CalendarBlankIcon aria-hidden className="size-4 shrink-0" />
            <span className="font-medium">{appointment.singular}:</span>
            <span className="text-muted-foreground">{m.day_tomorrow()}</span>
          </div>
        </Flash>
      </div>
      <nav
        aria-hidden
        className="grid grid-cols-4 gap-1 rounded-xl border bg-background px-1 py-1.5"
      >
        {nav.map(({ icon: IconComponent, label, watch }) => (
          <Flash
            key={label + String(watch)}
            watch={watch}
            className="mx-0 flex flex-col items-center gap-0.5 px-0.5 py-1 text-[0.7rem] text-muted-foreground"
          >
            <IconComponent className="size-5" />
            <span className="max-w-full truncate">{label}</span>
          </Flash>
        ))}
      </nav>
    </div>
  )
}

/** A half-typed word shows its last whole form instead of a blank. */
function initialWord(word: Words[keyof Words]): Words[keyof Words] {
  return {
    ...word,
    singular: word.singular.trim() || word.plural.trim(),
    plural: word.plural.trim() || word.singular.trim(),
  }
}

/**
 * The word as the app will show it, live while typing: a button, a screen
 * name and a count. These are the forms the app uses, never a gendered
 * adjective, so any word stays correct Bulgarian (design doc, Names).
 */
function Preview({ word }: { word: Words[keyof Words] }) {
  if (!word.singular.trim() || !word.plural.trim()) return null
  const chip =
    'inline-flex h-7 items-center rounded-full bg-foreground/6 px-2.5 text-xs font-medium'
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>{m.names_preview()}:</span>
      <span className={chip}>{m.new_job({ job: word.singular })}</span>
      <span className={chip}>{word.plural}</span>
      <span className={chip}>{m.count({ label: word.plural, count: 5 })}</span>
    </div>
  )
}
