import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { ListSkeleton } from '#/components/list-skeleton'
import { SettingsPage } from '#/components/settings/settings-page'
import { Flash, SettingsPreview } from '#/components/settings/settings-preview'
import { Field, FieldLabel } from '#/components/ui/field'
import { Switch } from '#/components/ui/switch'
import { useViewer } from '#/hooks/use-viewer'
import { runChange } from '#/lib/change'
import { vapidPublicKey } from '#/lib/env'
import {
  currentSubscription,
  isInAppBrowser,
  isIos,
  isStandalone,
  permissionState,
  pushAvailable,
  pushSupported,
  rememberPushSwitch,
  subscribePush,
  subscriptionArgs,
  unsubscribePush,
} from '#/lib/push'
import { m } from '#/paraglide/messages.js'

export const Route = createFileRoute('/_app/settings/notifications')({
  component: NotificationsSettings,
})

function Notice({ title, children }: { title?: string; children: string }) {
  return (
    <div className="mx-4 flex flex-col gap-1 surface p-4 text-sm">
      {title && <p className="font-medium">{title}</p>}
      <p className="text-muted-foreground">{children}</p>
    </div>
  )
}

function IosGuide() {
  return (
    <div className="mx-4 flex flex-col gap-2 surface p-4 text-sm">
      <p className="font-medium">{m.push_ios_title()}</p>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
        <li>{m.push_ios_step_share()}</li>
        <li>{m.push_ios_step_add()}</li>
        <li>{m.push_ios_step_open()}</li>
      </ol>
    </div>
  )
}

function NotificationsSettings() {
  const ios = isIos()
  let body: React.ReactNode
  if (isInAppBrowser()) {
    body = (
      <Notice title={m.push_inapp_title()}>
        {ios ? m.push_inapp_safari() : m.push_inapp_chrome()}
      </Notice>
    )
  } else if (ios && !isStandalone()) {
    body = <IosGuide />
  } else if (!import.meta.env.PROD) {
    body = <Notice>{m.push_dev()}</Notice>
  } else if (!pushSupported() || !vapidPublicKey) {
    body = <Notice>{m.push_unsupported()}</Notice>
  } else {
    body = <NotificationSwitches publicKey={vapidPublicKey} />
  }
  return (
    <SettingsPage
      title={m.push_title()}
      help={m.push_help()}
      preview={<MorningPreview />}
    >
      {body}
    </SettingsPage>
  )
}

/**
 * The morning summary as the phone shows it, built like the server's text
 * (convex/lib/pushText.ts) from sample counts and the switches as they are.
 */
function MorningPreview() {
  const { business } = useViewer()
  const settings = useQuery(api.push.settings, { businessId: business._id })
  if (!settings) return null
  const { notify } = settings
  const parts = [
    m.count({ label: business.words.appointment.plural, count: 2 }),
    ...(notify.overdue
      ? [m.count({ label: m.push_preview_overdue(), count: 1 })]
      : []),
    ...(notify.remindersDue
      ? [m.count({ label: m.push_preview_reminders(), count: 3 })]
      : []),
  ]
  return (
    <SettingsPreview title={m.push_preview_title()}>
      <Flash watch={notify}>
        {notify.morningSummary ? (
          <div className="flex gap-3 rounded-2xl bg-muted/70 p-3 text-sm">
            <img
              src="/icon-192.png"
              alt=""
              className="size-9 shrink-0 rounded-lg"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{m.push_preview_app()}</span>
                <span className="shrink-0 tabular-nums">7:30</span>
              </div>
              <p className="truncate font-semibold">
                {m.push_preview_heading({ name: business.name })}
              </p>
              <p className="text-muted-foreground">{parts.join(' · ')}</p>
            </div>
          </div>
        ) : (
          <p className="py-1 text-sm text-muted-foreground">
            {m.push_preview_off()}
          </p>
        )}
      </Flash>
    </SettingsPreview>
  )
}

function NotificationSwitches({ publicKey }: { publicKey: string }) {
  const { business } = useViewer()
  const args = { businessId: business._id }
  const settings = useQuery(api.push.settings, args)
  // Optimistic, so the switch and the preview move at the tap.
  const setNotify = useMutation(api.push.setNotify).withOptimisticUpdate(
    (store, { businessId, ...change }) => {
      const current = store.getQuery(api.push.settings, { businessId })
      if (!current) return
      const notify = { ...current.notify }
      for (const key of ['morningSummary', 'remindersDue', 'overdue'] as const)
        if (change[key] !== undefined) notify[key] = change[key]
      store.setQuery(api.push.settings, { businessId }, { ...current, notify })
    },
  )
  const subscribe = useMutation(api.push.subscribe)
  const unsubscribe = useMutation(api.push.unsubscribe)
  const [deviceOn, setDeviceOn] = useState<boolean | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState(permissionState() === 'denied')

  useEffect(() => {
    if (!pushAvailable()) return
    void currentSubscription()
      .then((subscription) => setDeviceOn(subscription !== null))
      .catch(() => setDeviceOn(false))
  }, [])

  const toggleDevice = async (on: boolean) => {
    setBusy(true)
    await runChange(async () => {
      if (on) {
        // The permission question comes from this tap, never from loading.
        const result = await subscribePush(publicKey)
        if (!result.ok) {
          setBlocked(permissionState() === 'denied')
          if (permissionState() !== 'denied') toast.error(m.push_failed())
          return
        }
        await subscribe(subscriptionArgs(result.subscription))
        rememberPushSwitch(true)
        setDeviceOn(true)
      } else {
        const endpoint = await unsubscribePush()
        rememberPushSwitch(false)
        if (endpoint) await unsubscribe({ endpoint })
        setDeviceOn(false)
      }
    })
    setBusy(false)
  }

  const save = (change: {
    morningSummary?: boolean
    remindersDue?: boolean
    overdue?: boolean
  }) =>
    void runChange(() => setNotify({ ...args, ...change })).then(
      (saved) => saved.done && toast.success(m.saved()),
    )

  if (!settings || deviceOn === undefined) return <ListSkeleton />

  return (
    <div className="flex flex-col gap-5 px-4">
      {blocked ? (
        <p role="alert" className="text-sm text-destructive">
          {m.push_blocked()}
        </p>
      ) : (
        <Field orientation="horizontal">
          <FieldLabel htmlFor="push-device">{m.push_master()}</FieldLabel>
          <Switch
            id="push-device"
            disabled={busy}
            checked={deviceOn}
            onCheckedChange={(checked) => void toggleDevice(checked)}
          />
        </Field>
      )}
      {deviceOn && (
        <>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="push-morning">{m.push_morning()}</FieldLabel>
            <Switch
              id="push-morning"
              checked={settings.notify.morningSummary}
              onCheckedChange={(checked) => save({ morningSummary: checked })}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="push-reminders">
              {m.push_reminders()}
            </FieldLabel>
            <Switch
              id="push-reminders"
              disabled={!settings.notify.morningSummary}
              checked={settings.notify.remindersDue}
              onCheckedChange={(checked) => save({ remindersDue: checked })}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="push-overdue">{m.push_overdue()}</FieldLabel>
            <Switch
              id="push-overdue"
              disabled={!settings.notify.morningSummary}
              checked={settings.notify.overdue}
              onCheckedChange={(checked) => save({ overdue: checked })}
            />
          </Field>
        </>
      )}
      <p className="text-sm text-muted-foreground">{m.push_when()}</p>
    </div>
  )
}
