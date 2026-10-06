import {
  CameraIcon,
  FilePdfIcon,
  PaperclipIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { useMutation, useQuery } from 'convex/react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Spinner } from '#/components/ui/spinner'
import { compressImage } from '#/lib/compress-image'
import { errorCode, errorMessage } from '#/lib/errors'
import { m } from '#/paraglide/messages.js'
import { api } from '../../../convex/_generated/api'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import type { Id } from '../../../convex/_generated/dataModel'

type Target = FunctionArgs<typeof api.files.list>['target']
type FileRow = FunctionReturnType<typeof api.files.list>[number]

function fileLabel(file: FileRow) {
  return file.name ?? (file.kind === 'photo' ? m.files_photo() : m.files_file())
}

/**
 * Photos and files on a Job, Client or Item: a grid, a one-tap camera, an
 * add-file button, and a viewer with remove. Uploads are compressed in the
 * browser first (D18) and checked again on the server (D14).
 */
export function FileGallery({
  businessId,
  target,
}: {
  businessId: Id<'businesses'>
  target: Target
}) {
  const files = useQuery(api.files.list, { businessId, target })
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const save = useMutation(api.files.save)
  const remove = useMutation(api.files.remove)
  const [uploading, setUploading] = useState(0)
  const [openId, setOpenId] = useState<Id<'files'> | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const opened = files?.find((file) => file._id === openId)

  async function upload(file: File) {
    setUploading((count) => count + 1)
    try {
      const small = await compressImage(file)
      const url = await generateUploadUrl({ businessId })
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': small.type || 'application/octet-stream' },
        body: small,
      })
      if (!response.ok) throw new Error('upload failed')
      const { storageId } = (await response.json()) as {
        storageId: Id<'_storage'>
      }
      const result = await save({
        businessId,
        storageId,
        target,
        name: file.type === 'application/pdf' ? file.name : undefined,
      })
      if ('rejected' in result) {
        toast.error(
          result.rejected === 'size'
            ? m.files_rejected_size()
            : m.files_rejected_type(),
        )
      }
    } catch (error) {
      toast.error(
        errorCode(error) ? errorMessage(error) : m.files_upload_failed(),
      )
    } finally {
      setUploading((count) => count - 1)
    }
  }

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    for (const file of picked) await upload(file)
  }

  async function onRemove(file: FileRow) {
    setRemoving(true)
    try {
      await remove({ businessId, fileId: file._id })
      setOpenId(null)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setRemoving(false)
      setConfirming(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4">
      <div className="flex flex-wrap gap-2">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => void onPick(event)}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(event) => void onPick(event)}
        />
        <Button
          size="xl"
          className="min-h-12"
          onClick={() => cameraRef.current?.click()}
        >
          <CameraIcon data-icon="inline-start" />
          {m.files_camera()}
        </Button>
        <Button
          size="xl"
          variant="outline"
          className="min-h-12"
          onClick={() => fileRef.current?.click()}
        >
          <PaperclipIcon data-icon="inline-start" />
          {m.files_add()}
        </Button>
        {uploading > 0 && (
          <span
            className="flex items-center gap-2 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Spinner />
            {m.files_uploading()}
          </span>
        )}
      </div>

      {files?.length === 0 && uploading === 0 && (
        <p className="text-sm text-muted-foreground">{m.files_empty()}</p>
      )}

      {files && files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((file) => (
            <li key={file._id}>
              <button
                type="button"
                className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => {
                  setConfirming(false)
                  setOpenId(file._id)
                }}
              >
                {file.kind === 'photo' && file.url ? (
                  <img
                    src={file.url}
                    alt={fileLabel(file)}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1 p-2 text-center text-xs text-muted-foreground">
                    <FilePdfIcon className="size-8" />
                    <span className="line-clamp-2 break-all">
                      {fileLabel(file)}
                    </span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={opened !== undefined}
        onOpenChange={(open) => {
          if (!open) setOpenId(null)
        }}
      >
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          {opened && (
            <>
              <SheetHeader>
                <SheetTitle>{fileLabel(opened)}</SheetTitle>
                <SheetDescription className="sr-only">
                  {fileLabel(opened)}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-3 px-4 pb-4">
                {opened.kind === 'photo' && opened.url && (
                  <a href={opened.url} target="_blank" rel="noreferrer">
                    <img
                      src={opened.url}
                      alt={fileLabel(opened)}
                      className="max-h-[60dvh] w-full rounded-xl object-contain"
                    />
                  </a>
                )}
                <div className="flex flex-wrap gap-2">
                  {opened.url && (
                    <Button
                      size="xl"
                      variant="outline"
                      render={
                        <a href={opened.url} target="_blank" rel="noreferrer" />
                      }
                    >
                      {m.files_open()}
                    </Button>
                  )}
                  {confirming ? (
                    <>
                      <Button
                        size="xl"
                        variant="destructive"
                        disabled={removing}
                        onClick={() => void onRemove(opened)}
                      >
                        {removing ? (
                          <Spinner />
                        ) : (
                          <TrashIcon data-icon="inline-start" />
                        )}
                        {m.files_remove_yes()}
                      </Button>
                      <Button
                        size="xl"
                        variant="ghost"
                        disabled={removing}
                        onClick={() => setConfirming(false)}
                      >
                        {m.files_remove_no()}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="xl"
                      variant="destructive"
                      onClick={() => setConfirming(true)}
                    >
                      <TrashIcon data-icon="inline-start" />
                      {m.files_remove()}
                    </Button>
                  )}
                </div>
                {confirming && (
                  <p className="text-sm text-muted-foreground">
                    {m.files_remove_confirm()}
                  </p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
