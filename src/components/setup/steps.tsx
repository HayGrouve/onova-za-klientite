import {
  AddressBookIcon,
  ClockIcon,
  FileXlsIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '#/components/ui/input-group'
import { Choices } from '#/components/setup/choices'
import type { Choice } from '#/components/setup/choices'
import { lower } from '#/i18n/words'
import { m } from '#/paraglide/messages.js'
import {
  ITEM_KINDS,
  JOB_WORDS,
  MAX_SERVICES,
  OWN_ITEM_FIELDS,
  REMINDER_MONTHS,
  REPEAT_EVERY,
} from '../../../shared/setup'
import type {
  RepeatEvery,
  SetupAnswers,
  SetupStep,
} from '../../../shared/setup'
import { stagesFor } from '../../../shared/stages'
import { guessGender, guessPlural } from '../../../shared/words'
import type { Words } from '../../../shared/words'

export type StepProps = {
  answers: SetupAnswers
  update: (patch: Partial<SetupAnswers>) => void
  words: Words
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <FieldLegend className="text-lg! leading-snug font-semibold tracking-tight text-balance">
      {children}
    </FieldLegend>
  )
}

const yesNo = (): Choice[] => [
  { value: 'yes', label: m.setup_yes() },
  { value: 'no', label: m.setup_no() },
]

function yesNoValue(value: boolean | undefined) {
  return value === undefined ? [] : [value ? 'yes' : 'no']
}

export const REPEAT_LABEL: Record<RepeatEvery, () => string> = {
  week: m.repeat_week,
  '2weeks': m.repeat_2weeks,
  month: m.repeat_month,
  '3months': m.repeat_3months,
  '6months': m.repeat_6months,
  year: m.repeat_year,
}

/** How long after a job the reminder rule asks: one month, 2 months, a year. */
export function monthsLabel(months: number) {
  if (months === 1) return m.setup_after_month()
  if (months === 12) return m.setup_after_year()
  if (months % 12 === 0) return m.setup_after_years({ years: months / 12 })
  return m.setup_after_months({ months })
}

function NameStep({ answers, update }: StepProps) {
  return (
    <FieldSet>
      <Title>{m.setup_name_title()}</Title>
      <Field>
        <FieldLabel htmlFor="business-name">{m.setup_name_label()}</FieldLabel>
        <Input
          id="business-name"
          value={answers.businessName ?? ''}
          autoComplete="organization"
          maxLength={120}
          onChange={(event) => update({ businessName: event.target.value })}
        />
        <FieldDescription>{m.setup_name_help()}</FieldDescription>
      </Field>
    </FieldSet>
  )
}

function JobWordStep({ answers, update }: StepProps) {
  const word = answers.jobWord
  const preset = JOB_WORDS.find((option) => option.singular === word?.singular)
  const isOther = !!word && !preset
  return (
    <FieldSet>
      <Title>{m.setup_job_title()}</Title>
      <FieldDescription>{m.setup_job_help()}</FieldDescription>
      <Choices
        label={m.setup_job_title()}
        layout="wrap"
        choices={[
          ...JOB_WORDS.map((option) => ({
            value: option.singular,
            label: option.singular,
          })),
          { value: 'other', label: m.setup_job_other() },
        ]}
        value={preset ? [preset.singular] : isOther ? ['other'] : []}
        onChange={([next]) =>
          update({
            jobWord:
              next === 'other'
                ? { singular: '', plural: '', gender: 'm' }
                : JOB_WORDS.find((option) => option.singular === next),
          })
        }
      />
      {isOther && (
        <FieldGroup className="flex-row! gap-3">
          <Field>
            <FieldLabel htmlFor="job-singular">
              {m.setup_own_singular()}
            </FieldLabel>
            <Input
              id="job-singular"
              autoFocus
              maxLength={40}
              value={word.singular}
              onChange={(event) =>
                update({
                  jobWord: {
                    singular: event.target.value,
                    plural: guessPlural(event.target.value),
                    gender: guessGender(event.target.value),
                  },
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="job-plural">{m.setup_own_plural()}</FieldLabel>
            <Input
              id="job-plural"
              maxLength={40}
              value={word.plural}
              onChange={(event) =>
                update({ jobWord: { ...word, plural: event.target.value } })
              }
            />
          </Field>
        </FieldGroup>
      )}
    </FieldSet>
  )
}

function FlowStep({ answers, update }: StepProps) {
  return (
    <FieldSet>
      <Title>{m.setup_flow_title()}</Title>
      <Choices
        label={m.setup_flow_title()}
        choices={[
          {
            value: 'single',
            label: m.setup_flow_single(),
            description: m.setup_flow_single_body(),
          },
          {
            value: 'multi',
            label: m.setup_flow_multi(),
            description: m.setup_flow_multi_body(),
          },
        ]}
        value={answers.flow ? [answers.flow] : []}
        onChange={([next]) => update({ flow: next as SetupAnswers['flow'] })}
      />
      {answers.flow && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{m.setup_flow_stages()}</span>
          <div className="flex flex-wrap gap-1.5">
            {stagesFor(answers.flow)
              .filter((stage) => stage.group !== 'cancelled')
              .map((stage) => (
                <Badge
                  key={stage.name}
                  variant="secondary"
                  className="h-7 px-2.5 text-sm"
                >
                  {stage.name}
                </Badge>
              ))}
          </div>
          <FieldDescription>{m.setup_flow_stages_help()}</FieldDescription>
        </div>
      )}
    </FieldSet>
  )
}

function ItemStep({ answers, update }: StepProps) {
  const item = answers.item
  const preset = ITEM_KINDS.find(
    (kind) => kind.word.singular === item?.word.singular,
  )
  const isOther = !!item && !preset
  const suggested = [
    ...new Set([
      ...(preset?.fields ?? OWN_ITEM_FIELDS),
      ...(item?.fields ?? []),
    ]),
  ]

  return (
    <FieldSet>
      <Title>{m.setup_item_title()}</Title>
      <FieldDescription>{m.setup_item_help()}</FieldDescription>
      <Choices
        label={m.setup_item_title()}
        layout="wrap"
        choices={yesNo()}
        value={yesNoValue(answers.hasItem)}
        onChange={([next]) => update({ hasItem: next === 'yes' })}
      />
      {answers.hasItem && (
        <>
          <FieldSet>
            <FieldLegend variant="label">{m.setup_item_name()}</FieldLegend>
            <Choices
              label={m.setup_item_name()}
              layout="wrap"
              choices={[
                ...ITEM_KINDS.map((kind) => ({
                  value: kind.word.singular,
                  label: kind.word.singular,
                })),
                { value: 'other', label: m.setup_item_other() },
              ]}
              value={preset ? [preset.word.singular] : isOther ? ['other'] : []}
              onChange={([next]) =>
                update({
                  item:
                    next === 'other'
                      ? {
                          word: { singular: '', plural: '', gender: 'm' },
                          fields: OWN_ITEM_FIELDS,
                        }
                      : ITEM_KINDS.find((kind) => kind.word.singular === next),
                })
              }
            />
          </FieldSet>
          {isOther && (
            <FieldGroup className="flex-row! gap-3">
              <Field>
                <FieldLabel htmlFor="item-singular">
                  {m.setup_own_singular()}
                </FieldLabel>
                <Input
                  id="item-singular"
                  autoFocus
                  maxLength={40}
                  value={item.word.singular}
                  onChange={(event) =>
                    update({
                      item: {
                        ...item,
                        word: {
                          singular: event.target.value,
                          plural: guessPlural(event.target.value),
                          gender: guessGender(event.target.value),
                        },
                      },
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-plural">
                  {m.setup_own_plural()}
                </FieldLabel>
                <Input
                  id="item-plural"
                  maxLength={40}
                  value={item.word.plural}
                  onChange={(event) =>
                    update({
                      item: {
                        ...item,
                        word: { ...item.word, plural: event.target.value },
                      },
                    })
                  }
                />
              </Field>
            </FieldGroup>
          )}
          {item && (
            <FieldSet>
              <FieldLegend variant="label">{m.setup_item_fields()}</FieldLegend>
              <Choices
                label={m.setup_item_fields()}
                layout="wrap"
                multiple
                choices={suggested.map((field) => ({
                  value: field,
                  label: field,
                }))}
                value={item.fields}
                onChange={(fields) => update({ item: { ...item, fields } })}
              />
            </FieldSet>
          )}
        </>
      )}
    </FieldSet>
  )
}

function MoneyStep({ answers, update }: StepProps) {
  return (
    <div className="flex flex-col gap-8">
      <FieldSet>
        <Title>{m.setup_deposit_title()}</Title>
        <Choices
          label={m.setup_deposit_title()}
          layout="wrap"
          choices={yesNo()}
          value={yesNoValue(answers.deposits)}
          onChange={([next]) => update({ deposits: next === 'yes' })}
        />
      </FieldSet>
      <FieldSet>
        <Title>{m.setup_costs_title()}</Title>
        <FieldDescription>{m.setup_costs_help()}</FieldDescription>
        <Choices
          label={m.setup_costs_title()}
          layout="wrap"
          choices={yesNo()}
          value={yesNoValue(answers.costs)}
          onChange={([next]) => update({ costs: next === 'yes' })}
        />
      </FieldSet>
    </div>
  )
}

function RepeatStep({ answers, update }: StepProps) {
  return (
    <FieldSet>
      <Title>{m.setup_repeat_title()}</Title>
      <Choices
        label={m.setup_repeat_title()}
        choices={[
          {
            value: 'schedule',
            label: m.setup_repeat_schedule(),
            description: m.setup_repeat_schedule_body(),
          },
          {
            value: 'months',
            label: m.setup_repeat_months(),
            description: m.setup_repeat_months_body(),
          },
          { value: 'none', label: m.setup_repeat_none() },
        ]}
        value={answers.repeat ? [answers.repeat] : []}
        onChange={([next]) =>
          update({ repeat: next as SetupAnswers['repeat'] })
        }
      />
      {answers.repeat === 'schedule' && (
        <FieldSet>
          <FieldLegend variant="label">{m.setup_repeat_every()}</FieldLegend>
          <Choices
            label={m.setup_repeat_every()}
            layout="wrap"
            choices={REPEAT_EVERY.map((every) => ({
              value: every,
              label: REPEAT_LABEL[every](),
            }))}
            value={[answers.repeatEvery ?? 'week']}
            onChange={([next]) => update({ repeatEvery: next as RepeatEvery })}
          />
        </FieldSet>
      )}
      {answers.repeat === 'months' && (
        <FieldSet>
          <FieldLegend variant="label">{m.setup_repeat_after()}</FieldLegend>
          <Choices
            label={m.setup_repeat_after()}
            layout="wrap"
            choices={REMINDER_MONTHS.map((months) => ({
              value: String(months),
              label: monthsLabel(months),
            }))}
            value={[String(answers.reminderMonths ?? 12)]}
            onChange={([next]) => update({ reminderMonths: Number(next) })}
          />
        </FieldSet>
      )}
    </FieldSet>
  )
}

const EMPTY_ROWS = [
  { name: '', price: '' },
  { name: '', price: '' },
  { name: '', price: '' },
]

function ServicesStep({ answers, update }: StepProps) {
  const rows = answers.services ?? EMPTY_ROWS
  const setRow = (index: number, patch: Partial<(typeof rows)[number]>) =>
    update({
      services: rows.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    })

  return (
    <FieldSet>
      <Title>{m.setup_services_title()}</Title>
      <FieldDescription>{m.setup_services_help()}</FieldDescription>
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_2.75rem] items-center gap-2">
        <span id="svc-name" className="text-sm font-medium">
          {m.setup_service_name()}
        </span>
        <span id="svc-price" className="text-sm font-medium">
          {m.setup_service_price()}
        </span>
        <span />
        {rows.map((row, index) => (
          <div key={index} className="contents">
            <Input
              aria-labelledby="svc-name"
              maxLength={60}
              value={row.name}
              onChange={(event) => setRow(index, { name: event.target.value })}
            />
            <InputGroup>
              <InputGroupInput
                aria-labelledby="svc-price"
                inputMode="decimal"
                maxLength={12}
                value={row.price}
                onChange={(event) =>
                  setRow(index, { price: event.target.value })
                }
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>€</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={m.setup_service_remove()}
              onClick={() =>
                update({ services: rows.filter((_, i) => i !== index) })
              }
            >
              <XIcon />
            </Button>
          </div>
        ))}
      </div>
      {rows.length < MAX_SERVICES && (
        <Button
          variant="outline"
          size="xl"
          className="w-fit"
          onClick={() =>
            update({ services: [...rows, { name: '', price: '' }] })
          }
        >
          <PlusIcon data-icon="inline-start" />
          {m.setup_service_add()}
        </Button>
      )}
    </FieldSet>
  )
}

function ImportStep({ answers, update, words }: StepProps) {
  return (
    <FieldSet>
      <Title>
        {m.setup_import_title({ clients: lower(words.client.plural) })}
      </Title>
      <FieldDescription>{m.setup_import_help()}</FieldDescription>
      <Choices
        label={m.setup_import_title({ clients: lower(words.client.plural) })}
        choices={[
          {
            value: 'phone',
            label: m.setup_import_phone(),
            icon: AddressBookIcon,
          },
          { value: 'excel', label: m.setup_import_excel(), icon: FileXlsIcon },
          { value: 'later', label: m.setup_import_later(), icon: ClockIcon },
        ]}
        value={answers.importFrom ? [answers.importFrom] : []}
        onChange={([next]) =>
          update({ importFrom: next as SetupAnswers['importFrom'] })
        }
      />
      {(answers.importFrom === 'phone' || answers.importFrom === 'excel') && (
        <p className="text-sm text-muted-foreground">{m.setup_import_next()}</p>
      )}
    </FieldSet>
  )
}

export const STEP_BODY: Record<
  SetupStep,
  (props: StepProps) => React.ReactNode
> = {
  name: NameStep,
  jobWord: JobWordStep,
  flow: FlowStep,
  item: ItemStep,
  money: MoneyStep,
  repeat: RepeatStep,
  services: ServicesStep,
  import: ImportStep,
}
