import {
  CalendarBlankIcon,
  ClipboardTextIcon,
  StackIcon,
  UsersIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { ListSkeleton } from '#/components/list-skeleton'
import { useSubmit } from '#/components/money/use-submit'
import { SettingsPage } from '#/components/settings/settings-page'
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
  return (
    <SettingsPage title={m.settings_names()} help={m.names_help()}>
      {!settings ? (
        <ListSkeleton />
      ) : (
        <NamesForm initial={settings.words} owner={settings.role === 'owner'} />
      )}
    </SettingsPage>
  )
}

function NamesForm({ initial, owner }: { initial: Words; owner: boolean }) {
  const { business } = useViewer()
  const setWords = useMutation(api.businesses.setWords)
  const { busy, run } = useSubmit(() => {})
  const [words, setDraft] = useState<Words>(initial)
  const valid = KEYS.every(({ key }) => isValidWord(words[key]))
  const change = (key: keyof Words, patch: Partial<Words[keyof Words]>) =>
    setDraft({ ...words, [key]: { ...words[key], ...patch } })

  return (
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
            <PanelBody className="flex flex-col gap-4">
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
  )
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
