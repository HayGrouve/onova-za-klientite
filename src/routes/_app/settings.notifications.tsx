import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { ListSkeleton } from '#/components/list-skeleton'
import { SettingsPage } from '#/components/settings/settings-page'
import { Field, FieldLabel } from '#/components/ui/field'
import { Switch } from '#/components/ui/switch'
import { useViewer } from '#/hooks/use-viewer'
import { errorMessage } from '#/lib/errors'
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
    <div className="mx-4 flex flex-col gap-1 rounded-2xl bg-muted/60 p-4 text-sm">
      {title && <p className="font-medium">{title}</p>}
      <p className="text-muted-foreground">{children}</p>
    </div>
  )
}

function IosGuide() {
  return (
    <div className="mx-4 flex flex-col gap-2 rounded-2xl bg-muted/60 p-4 text-sm">
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
    <SettingsPage title={m.push_title()} help={m.push_help()}>
      {body}
    </SettingsPage>
  )
}

function NotificationSwitches({ publicKey }: { publicKey: string }) {
  const { business } = useViewer()
  const args = { businessId: business._id }
  const settings = useQuery(api.push.settings, args)
  const setNotify = useMutation(api.push.setNotify)
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
    try {
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
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const save = (change: {
    morningSummary?: boolean
    remindersDue?: boolean
    overdue?: boolean
  }) =>
    void setNotify({ ...args, ...change }).catch((error: unknown) =>
      toast.error(errorMessage(error)),
    )

  if (!settings || deviceOn === undefined) return <ListSkeleton />

  return (
    <div className="flex flex-col gap-5 px-4">
      {blocked ? (
        <p className="text-sm text-destructive">{m.push_blocked()}</p>
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
