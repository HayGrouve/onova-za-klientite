import {
  CalendarBlankIcon,
  MagnifyingGlassIcon,
  RepeatIcon,
} from '@phosphor-icons/react'
import { cn } from 'cn'
import { repeatLabel } from '#/components/job/repeat-section'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Switch } from '#/components/ui/switch'
import { lower } from '#/i18n/words'
import { m } from '#/paraglide/messages.js'
import { formatMoney } from '../../../shared/money'
import { jobFormFields } from '../../../shared/setup'
import type { FormField, SetupSettings, SetupStep } from '../../../shared/setup'

const FIELD_STEP: Record<FormField, SetupStep> = {
  client: 'import',
  item: 'item',
  title: 'services',
  price: 'money',
  deposit: 'money',
  when: 'flow',
  due: 'flow',
  repeat: 'repeat',
}

type RowProps = {
  step: SetupStep
  label: string
  highlight: SetupStep | null
  pulse: number
  onEdit?: (step: SetupStep) => void
  children: React.ReactNode
}

function Row({ step, label, highlight, pulse, onEdit, children }: RowProps) {
  const active = highlight === step
  return (
    <div
      // Re-keying restarts the flash each time the same step changes again.
      key={active ? `pulse-${pulse}` : 'still'}
      data-step={step}
      className={cn(
        '-mx-2 flex flex-col gap-1.5 rounded-xl px-2 py-1.5',
        active && 'motion-safe:animate-[flash_1.4s_ease-out]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {onEdit && (
          <Button
            variant="link"
            className="h-8 px-0"
            onClick={() => onEdit(step)}
          >
            {m.setup_change()}
          </Button>
        )}
      </div>
      {children}
    </div>
  )
}

function FakeInput({
  children,
  icon,
}: {
  children?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="flex h-11 items-center gap-2 rounded-xl border border-input px-3 text-sm text-muted-foreground">
      {icon}
      {children}
    </div>
  )
}

/** A read-only miniature of the new-job form, built from the settings the answers give. */
export function JobFormPreview({
  settings,
  highlight,
  pulse,
  onEdit,
}: {
  settings: SetupSettings
  highlight: SetupStep | null
  pulse: number
  onEdit?: (step: SetupStep) => void
}) {
  const row = { highlight, pulse, onEdit }
  const { words } = settings
  return (
    <div className="flex flex-col gap-3" aria-label={m.preview_label()}>
      <Row step="jobWord" label={settings.name} {...row}>
        <span className="text-xl font-semibold tracking-tight">
          {m.preview_add({ job: lower(words.job.singular) })}
        </span>
      </Row>

      {jobFormFields(settings).map((field) => {
        const props = { ...row, step: FIELD_STEP[field] }
        switch (field) {
          case 'client':
            return (
              <Row key={field} {...props} label={words.client.singular}>
                <FakeInput icon={<MagnifyingGlassIcon className="size-4" />}>
                  {m.preview_client_hint()}
                </FakeInput>
              </Row>
            )
          case 'item':
            return (
              <Row key={field} {...props} label={words.item.singular}>
                <FakeInput>
                  {settings.item?.fields.join(', ') || m.preview_item_hint()}
                </FakeInput>
              </Row>
            )
          case 'title':
            return (
              <Row key={field} {...props} label={m.preview_what()}>
                <FakeInput />
                {settings.services.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {settings.services.slice(0, 4).map((service) => (
                      <Badge
                        key={service.name}
                        variant="outline"
                        className="h-7 px-2.5 text-sm font-normal"
                      >
                        {service.name} {formatMoney(service.priceCents)}
                      </Badge>
                    ))}
                  </div>
                )}
              </Row>
            )
          case 'price':
            return (
              <Row key={field} {...props} label={m.preview_price()}>
                <FakeInput>€</FakeInput>
              </Row>
            )
          case 'deposit':
            return (
              <Row key={field} {...props} label={m.preview_deposit()}>
                <FakeInput>€</FakeInput>
              </Row>
            )
          case 'when':
            return (
              <Row key={field} {...props} label={m.preview_when()}>
                <FakeInput icon={<CalendarBlankIcon className="size-4" />}>
                  {m.preview_when_hint()}
                </FakeInput>
              </Row>
            )
          case 'due':
            return (
              <Row key={field} {...props} label={m.preview_due()}>
                <FakeInput icon={<CalendarBlankIcon className="size-4" />}>
                  {m.preview_due_hint()}
                </FakeInput>
              </Row>
            )
          case 'repeat': {
            const label = repeatLabel(
              settings.repeatDefault ?? { every: 1, unit: 'week' },
            )
            return (
              <Row key={field} {...props} label={m.preview_repeat()}>
                <div className="flex items-center gap-2 text-sm">
                  <RepeatIcon className="size-4" />
                  <span className="flex-1">{label}</span>
                  <Switch checked aria-label={m.preview_repeat()} />
                </div>
              </Row>
            )
          }
        }
      })}

      <Row step="flow" label={m.preview_stage()} {...row}>
        <div className="flex flex-wrap gap-1.5">
          {settings.stages
            .filter((stage) => stage.group !== 'cancelled')
            .map((stage, index) => (
              <Badge
                key={stage.name}
                variant={index === 0 ? 'default' : 'outline'}
                className="h-7 px-2.5 text-sm font-normal"
              >
                {stage.name}
              </Badge>
            ))}
        </div>
      </Row>
    </div>
  )
}
