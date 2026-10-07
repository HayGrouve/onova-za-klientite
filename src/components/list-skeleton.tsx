import { Skeleton } from '#/components/ui/skeleton'

export function ListSkeleton() {
  return (
    <div className="mx-4 flex flex-col divide-y divide-border/70 overflow-hidden surface">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex flex-col gap-2 px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-1/2 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-2/3 rounded-full" />
        </div>
      ))}
    </div>
  )
}
