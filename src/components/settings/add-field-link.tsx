import { useState } from 'react'
import { AddFieldSheet } from '#/components/settings/field-add-sheet'
import { Button } from '#/components/ui/button'
import { useViewer } from '#/hooks/use-viewer'
import { m } from '#/paraglide/messages.js'

type Target = 'client' | 'job' | 'item'

/** A small "+ field" link under a form's extra fields: adds a field right where it is needed. */
export function AddFieldLink({ target }: { target: Target }) {
  const { business, businesses } = useViewer()
  const [open, setOpen] = useState(false)
  // Fields are business settings: only the owner adds them.
  if (businesses.find((item) => item._id === business._id)?.role !== 'owner')
    return null
  return (
    <>
      <Button
        type="button"
        variant="link"
        className="h-9 w-fit px-0"
        onClick={() => setOpen(true)}
      >
        {m.fields_settings_add_link()}
      </Button>
      <AddFieldSheet
        businessId={business._id}
        target={target}
        targetName={business.words[target].plural}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
