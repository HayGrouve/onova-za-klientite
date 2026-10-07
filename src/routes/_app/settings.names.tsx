import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { ListSkeleton } from '#/components/list-skeleton'
import { useSubmit } from '#/components/money/use-submit'
import { SettingsPage } from '#/components/settings/settings-page'
import { Button } from '#/components/ui/button'
import { Field, FieldLabel, FieldLegend, FieldSet } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'
import { guessPlural, isValidWord } from '../../../shared/words'
import type { Gender, Words } from '../../../shared/words'

export const Route = createFileRoute('/_app/settings/names')({
  component: NamesSettings,
})

const KEYS: Array<{ key: keyof Words; label: () => string }> = [
  { key: 'client', label: m.names_word_client },
  { key: 'job', label: m.names_word_job },
  { key: 'item', label: m.names_word_item },
  { key: 'appointment', label: m.names_word_appointment },
]

const GENDERS: Array<{ value: Gender; label: () => string }> = [
  { value: 'm', label: m.gender_m },
  { value: 'f', label: m.gender_f },
  { value: 'n', label: m.gender_n },
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
      className="flex flex-col gap-6 px-4"
      onSubmit={(event) => {
        event.preventDefault()
        void run(() => setWords({ businessId: business._id, words }))
      }}
    >
      <fieldset disabled={!owner} className="contents">
        {KEYS.map(({ key, label }) => (
          <FieldSet key={key} className="surface p-4">
            <FieldLegend variant="label">{label()}</FieldLegend>
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
            <Field>
              <FieldLabel>{m.names_gender()}</FieldLabel>
              <ToggleGroup
                aria-label={m.names_gender()}
                value={[words[key].gender]}
                onValueChange={(next: string[]) => {
                  if (next[0]) change(key, { gender: next[0] as Gender })
                }}
                variant="outline"
                size="xl"
              >
                {GENDERS.map((gender) => (
                  <ToggleGroupItem
                    key={gender.value}
                    value={gender.value}
                    className="aria-pressed:border-primary aria-pressed:bg-primary/8"
                  >
                    {gender.label()}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
          </FieldSet>
        ))}
        <Button type="submit" size="xl" disabled={busy || !valid}>
          {busy && <Spinner data-icon="inline-start" />}
          {m.save()}
        </Button>
      </fieldset>
    </form>
  )
}
