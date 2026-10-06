import type { JobFlow } from './stages'
import { DEFAULT_WORDS } from './words'
import type { Words } from './words'

export type Modules = {
  appointments: boolean
  costs: boolean
  items: boolean
  reminders: boolean
  services: boolean
}

/** What a business gets when setup is skipped entirely (Q4). */
export const DEFAULT_MODULES: Modules = {
  appointments: true,
  costs: true,
  items: false,
  reminders: false,
  services: false,
}

export type BusinessDefaults = {
  name: string
  words: Words
  modules: Modules
  jobFlow: JobFlow
  depositsOnNewJob: boolean
}

export const DEFAULT_BUSINESS_NAME = 'Моят бизнес'

export function defaultBusiness(): BusinessDefaults {
  return {
    name: DEFAULT_BUSINESS_NAME,
    words: {
      client: { ...DEFAULT_WORDS.client },
      job: { ...DEFAULT_WORDS.job },
      item: { ...DEFAULT_WORDS.item },
      appointment: { ...DEFAULT_WORDS.appointment },
    },
    modules: { ...DEFAULT_MODULES },
    jobFlow: 'single',
    depositsOnNewJob: false,
  }
}
