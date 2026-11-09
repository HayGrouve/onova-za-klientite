import { runSetup } from './support/app'
import { deleteMyData, expect, test } from './support/fixtures'

const BUSINESS = 'За изтриване Е2Е'

test('Изтрий данните keeps you signed in and starts over on setup', async ({
  page,
}) => {
  await runSetup(page, { name: BUSINESS })
  await expect(page.getByRole('banner')).toContainText(BUSINESS)

  await page.goto('/settings/data')
  // The Акаунт is deleted elsewhere: a line points there.
  await expect(
    page.getByText(/Искаш да изтриеш целия си Акаунт\?/),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Акаунт', exact: true }),
  ).toHaveAttribute('href', /^https:\/\//)
  const remove = page.getByRole('button', { name: 'Изтрий данните' })
  await expect(remove).toBeDisabled()

  await deleteMyData(page)

  // A brand new start: setup asks for a name again, and the old business is gone.
  await expect(page.getByLabel('Име на бизнеса')).toBeVisible()
  await runSetup(page, { name: 'Наново Е2Е' })
  await expect(page.getByRole('banner')).toContainText('Наново Е2Е')
  await expect(page.getByRole('banner')).not.toContainText(BUSINESS)
})
