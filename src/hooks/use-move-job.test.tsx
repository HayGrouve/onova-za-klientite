// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMoveJob } from './use-move-job'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  changeStage: vi.fn(),
  cancel: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('../../convex/_generated/api', () => ({
  api: {
    jobs: { changeStage: 'changeStage', cancel: 'cancel', board: 'board' },
  },
}))
vi.mock('convex/react', () => ({
  useMutation: (reference: string) => {
    const run = reference === 'cancel' ? mocks.cancel : mocks.changeStage
    return Object.assign(run, { withOptimisticUpdate: () => run })
  },
}))
vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('#/hooks/use-viewer', () => ({
  useViewer: () => ({
    business: {
      _id: 'business-1',
      modules: { reminders: true },
      reminderRule: { months: 12 },
    },
  }),
}))

type Hook = ReturnType<typeof useMoveJob>
let hook: Hook

function Harness() {
  hook = useMoveJob()
  return <div data-offer={hook.ruleOffer?._id ?? ''} />
}

const fresh = { _id: 's1', name: 'New', group: 'new' } as never
const doing = { _id: 's2', name: 'In progress', group: 'in_progress' } as never
const done = { _id: 's3', name: 'Done', group: 'done' } as never
const job = (stageGroup: 'new' | 'in_progress' | 'done') =>
  ({
    _id: 'job-1',
    title: 'Sofa',
    stageGroup,
    isNoClient: false,
    balanceCents: 0,
  }) as never

/** The options of the latest stage toast. */
const lastToast = () => mocks.toastSuccess.mock.lastCall?.[1]

describe('useMoveJob', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    mocks.changeStage.mockReset().mockResolvedValue(undefined)
    mocks.cancel.mockReset().mockResolvedValue(undefined)
    mocks.toastSuccess.mockReset()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => root.render(<Harness />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('announces a move that offers no rule at once, with Undo', async () => {
    await act(() => hook.moveAndAnnounce(job('new'), doing, fresh))
    expect(mocks.changeStage).toHaveBeenCalledWith({
      businessId: 'business-1',
      jobId: 'job-1',
      stageId: 's2',
    })
    expect(hook.ruleOffer).toBeNull()
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1)
    expect(lastToast().id).toBe('stage-moved')
    expect(lastToast().action.label).toBeTruthy()
  })

  it('cancels through the cancel mutation', async () => {
    await act(() => hook.moveAndAnnounce(job('new'), 'cancelled', fresh))
    expect(mocks.cancel).toHaveBeenCalledWith({
      businessId: 'business-1',
      jobId: 'job-1',
    })
    expect(mocks.changeStage).not.toHaveBeenCalled()
    expect(hook.ruleOffer).toBeNull()
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('sends why the job is cancelled, and only into Cancelled', async () => {
    const declined = { _id: 's4', name: 'Declined', group: 'cancelled' }
    await act(() =>
      hook.moveAndAnnounce(job('new'), 'cancelled', fresh, {
        cancelReason: 'Too dear',
      }),
    )
    expect(mocks.cancel).toHaveBeenCalledWith({
      businessId: 'business-1',
      jobId: 'job-1',
      reason: 'Too dear',
    })
    await act(() =>
      hook.moveAndAnnounce(job('new'), declined as never, fresh, {
        cancelReason: 'Too dear',
      }),
    )
    expect(mocks.changeStage).toHaveBeenLastCalledWith({
      businessId: 'business-1',
      jobId: 'job-1',
      stageId: 's4',
      cancelReason: 'Too dear',
    })
    await act(() =>
      hook.moveAndAnnounce(job('new'), doing, fresh, {
        cancelReason: 'Too dear',
      }),
    )
    expect(mocks.changeStage).toHaveBeenLastCalledWith({
      businessId: 'business-1',
      jobId: 'job-1',
      stageId: 's2',
    })
  })

  it('holds the toast while the rule offer is open, then shows it', async () => {
    await act(() => hook.moveAndAnnounce(job('in_progress'), done, doing))
    expect(hook.ruleOffer).toEqual({
      _id: 'job-1',
      title: 'Sofa',
      itemId: undefined,
    })
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    act(() => hook.closeRuleOffer())
    expect(hook.ruleOffer).toBeNull()
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('shows nothing when the move did not happen', async () => {
    mocks.changeStage.mockRejectedValue(new Error('no'))
    await act(() => hook.moveAndAnnounce(job('in_progress'), done, doing))
    expect(hook.ruleOffer).toBeNull()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('closes the offer, and drops its toast, when Undo moves the job back', async () => {
    // New to In progress leaves a toast whose Undo goes back to New.
    await act(() => hook.moveAndAnnounce(job('new'), doing, fresh))
    const undo = lastToast().action
    await act(() => hook.moveAndAnnounce(job('in_progress'), done, doing))
    expect(hook.ruleOffer?._id).toBe('job-1')
    mocks.toastSuccess.mockClear()
    await act(async () => {
      undo.onClick()
    })
    expect(mocks.changeStage).toHaveBeenLastCalledWith({
      businessId: 'business-1',
      jobId: 'job-1',
      stageId: 's1',
    })
    expect(hook.ruleOffer).toBeNull()
    // The job is not in Done any more, so "moved to Done" is not shown.
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('keeps the offer when a failed Undo did not move the job', async () => {
    await act(() => hook.moveAndAnnounce(job('new'), doing, fresh))
    const undo = lastToast().action
    await act(() => hook.moveAndAnnounce(job('in_progress'), done, doing))
    mocks.changeStage.mockRejectedValue(new Error('no'))
    await act(async () => {
      undo.onClick()
    })
    expect(hook.ruleOffer?._id).toBe('job-1')
  })
})
