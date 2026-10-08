export function CenteredMessage({
  children,
  role,
}: {
  children: React.ReactNode
  /** "status" for a loading state, "alert" for an error: a screen reader announces it. */
  role?: 'status' | 'alert'
}) {
  return (
    <div
      role={role}
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      {children}
    </div>
  )
}
