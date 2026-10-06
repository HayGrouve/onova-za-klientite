export function ListSection({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex min-h-9 items-center justify-between gap-2 px-4">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        {action}
      </div>
      <ul className="flex flex-col">{children}</ul>
    </section>
  )
}
