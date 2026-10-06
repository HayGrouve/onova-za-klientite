import { Skeleton } from '#/components/ui/skeleton'

export function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-16 rounded-2xl" />
      ))}
    </div>
  )
}
