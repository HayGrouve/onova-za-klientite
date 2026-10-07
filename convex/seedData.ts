// Dev seed content: two unrelated businesses set up through the same core,
// as in the prototypes. Only data; `seed.ts` writes it.
import type { BusinessDefaults } from '../shared/setup'
import type { StageDraft } from '../shared/stages'

type SeedField = { name: string; type: 'text' | 'number'; showInList: boolean }

type SeedClient = {
  name: string
  kind?: 'person' | 'company'
  phones?: string[]
  email?: string
  address?: string
  note?: string
  items?: Array<{ name: string; extra: Record<string, string> }>
}

/** Days are relative to today in Sofia, so Today always has something to show. */
type SeedPayment = {
  amountCents: number
  daysAgo: number
  method: 'cash' | 'bank' | 'card' | 'other'
  label?: string
}

type SeedJob = {
  client: string
  title: string
  stage: string
  typedPriceCents?: number
  lines?: Array<{
    description: string
    quantity: number
    unitPriceCents: number
    service?: string
  }>
  dueInDays?: number
  doneDaysAgo?: number
  createdDaysAgo: number
  items?: string[]
  payments?: SeedPayment[]
  costs?: Array<{ label: string; amountCents: number; daysAgo: number }>
  appointment?: {
    inDays: number
    hour: number
    minute: number
    hours: number
    label: string
  }
  cancelReason?: string
  notes?: string
}

export type SeedBusiness = {
  key: string
  jobs: SeedJob[]
  /** Payments not tied to a job: client credit. */
  credit?: Array<{ client: string } & SeedPayment>
  generalCosts?: Array<{ label: string; amountCents: number; daysAgo: number }>
  reminders?: Array<{
    client: string
    item?: string
    note: string
    inDays: number
    source: 'manual' | 'rule'
    status?: 'open' | 'done'
  }>
  settings: BusinessDefaults & { reminderRule?: { months: number } }
  stages: StageDraft[]
  services: Array<{ name: string; priceCents: number }>
  itemFields: SeedField[]
  clients: SeedClient[]
}

export const SEED_BUSINESSES: SeedBusiness[] = [
  {
    key: 'furniture',
    settings: {
      name: 'Мебели Стоянов',
      words: {
        client: { singular: 'Клиент', plural: 'Клиенти', gender: 'm' },
        job: { singular: 'Поръчка', plural: 'Поръчки', gender: 'f' },
        item: { singular: 'Обект', plural: 'Обекти', gender: 'm' },
        appointment: { singular: 'Среща', plural: 'Срещи', gender: 'f' },
      },
      modules: {
        appointments: true,
        costs: true,
        items: false,
        reminders: false,
        services: true,
      },
      jobFlow: 'multi',
      depositsOnNewJob: true,
    },
    stages: [
      { name: 'Оглед', group: 'new', color: 'blue' },
      { name: 'Изработка', group: 'in_progress', color: 'amber' },
      { name: 'Монтаж', group: 'in_progress', color: 'violet' },
      { name: 'Готово', group: 'done', color: 'green' },
      { name: 'Отказано', group: 'cancelled', color: 'gray' },
    ],
    services: [
      { name: 'Оглед и замерване', priceCents: 2000 },
      { name: 'Гардероб, на линеен метър', priceCents: 35000 },
      { name: 'Кухня, на линеен метър', priceCents: 42000 },
      { name: 'Монтаж', priceCents: 4000 },
    ],
    itemFields: [],
    clients: [
      {
        name: 'Иван Петров',
        phones: ['+359888123456'],
        address: 'София, кв. Лозенец, ул. Златовръх 12',
      },
      {
        name: 'Мария Георгиева',
        phones: ['+359887654321'],
        email: 'maria.georgieva@example.com',
        address: 'София, ж.к. Младост 1, бл. 24',
      },
      {
        name: 'Офис Строй ООД',
        kind: 'company',
        phones: ['+35929876543'],
        address: 'София, бул. Цариградско шосе 115',
        note: 'Плащат по банка, до 10 дни след монтажа.',
      },
      { name: 'Петър Николов', phones: ['+359899111222'] },
    ],
    jobs: [
      {
        client: 'Иван Петров',
        title: 'Гардероб в спалнята',
        stage: 'Изработка',
        typedPriceCents: 95000,
        dueInDays: 2,
        createdDaysAgo: 20,
        payments: [
          { amountCents: 30000, daysAgo: 20, method: 'cash', label: 'Капаро' },
        ],
        costs: [{ label: 'ПДЧ и обков', amountCents: 22000, daysAgo: 15 }],
        notes: 'Плъзгащи врати, огледало отляво.',
      },
      {
        client: 'Мария Георгиева',
        title: 'Кухня',
        stage: 'Монтаж',
        lines: [
          {
            description: 'Кухня, на линеен метър',
            quantity: 3.2,
            unitPriceCents: 42000,
            service: 'Кухня, на линеен метър',
          },
          {
            description: 'Монтаж',
            quantity: 1,
            unitPriceCents: 4000,
            service: 'Монтаж',
          },
        ],
        dueInDays: -3,
        createdDaysAgo: 35,
        payments: [
          { amountCents: 70000, daysAgo: 30, method: 'bank', label: 'Капаро' },
        ],
        costs: [
          { label: 'Плот и мивка', amountCents: 38000, daysAgo: 25 },
          { label: 'Транспорт', amountCents: 6000, daysAgo: 1 },
        ],
        appointment: {
          inDays: 0,
          hour: 14,
          minute: 0,
          hours: 3,
          label: 'Монтаж',
        },
      },
      {
        client: 'Офис Строй ООД',
        title: 'Офис бюра, 6 броя',
        stage: 'Готово',
        typedPriceCents: 180000,
        createdDaysAgo: 40,
        doneDaysAgo: 10,
        payments: [
          { amountCents: 100000, daysAgo: 40, method: 'bank', label: 'Капаро' },
        ],
        costs: [{ label: 'Материали', amountCents: 60000, daysAgo: 35 }],
      },
      {
        client: 'Петър Николов',
        title: 'Библиотека в хола',
        stage: 'Оглед',
        createdDaysAgo: 2,
        appointment: {
          inDays: 1,
          hour: 10,
          minute: 0,
          hours: 1,
          label: 'Оглед',
        },
      },
      {
        client: 'Иван Петров',
        title: 'Нощни шкафчета',
        stage: 'Готово',
        typedPriceCents: 24000,
        createdDaysAgo: 60,
        doneDaysAgo: 45,
        payments: [{ amountCents: 24000, daysAgo: 45, method: 'cash' }],
      },
      {
        client: 'Петър Николов',
        title: 'Етажерка',
        stage: 'Отказано',
        typedPriceCents: 32000,
        createdDaysAgo: 30,
        cancelReason: 'Отказа офертата',
      },
    ],
    credit: [
      {
        client: 'Петър Николов',
        amountCents: 10000,
        daysAgo: 2,
        method: 'bank',
        label: 'Капаро',
      },
    ],
    generalCosts: [
      { label: 'Наем на цеха', amountCents: 40000, daysAgo: 4 },
      { label: 'Гориво', amountCents: 8000, daysAgo: 1 },
    ],
  },
  {
    key: 'ac',
    settings: {
      name: 'Хладина Сервиз',
      words: {
        client: { singular: 'Клиент', plural: 'Клиенти', gender: 'm' },
        job: { singular: 'Посещение', plural: 'Посещения', gender: 'n' },
        item: { singular: 'Климатик', plural: 'Климатици', gender: 'm' },
        appointment: { singular: 'Среща', plural: 'Срещи', gender: 'f' },
      },
      modules: {
        appointments: true,
        costs: false,
        items: true,
        reminders: true,
        services: true,
      },
      jobFlow: 'single',
      depositsOnNewJob: false,
      reminderRule: { months: 12 },
    },
    stages: [
      { name: 'Насрочено', group: 'new', color: 'blue' },
      { name: 'В работа', group: 'in_progress', color: 'amber' },
      { name: 'Изпълнено', group: 'done', color: 'green' },
      { name: 'Отказано', group: 'cancelled', color: 'gray' },
    ],
    services: [
      { name: 'Профилактика', priceCents: 5000 },
      { name: 'Монтаж на климатик', priceCents: 15000 },
      { name: 'Зареждане с фреон', priceCents: 8000 },
    ],
    itemFields: [
      { name: 'Модел', type: 'text', showInList: true },
      { name: 'Помещение', type: 'text', showInList: true },
    ],
    clients: [
      {
        name: 'Георги Димитров',
        phones: ['+359878333444'],
        address: 'Варна, ул. Цар Симеон I 5',
        items: [
          {
            name: 'Daikin FTXM35, хол',
            extra: { Модел: 'Daikin FTXM35', Помещение: 'Хол' },
          },
          {
            name: 'Mitsubishi MSZ-LN25, спалня',
            extra: { Модел: 'Mitsubishi MSZ-LN25', Помещение: 'Спалня' },
          },
        ],
      },
      {
        name: 'Елена Иванова',
        phones: ['+359876555666'],
        address: 'Варна, ж.к. Чайка, бл. 7',
        items: [
          {
            name: 'Gree Fairy, кухня',
            extra: { Модел: 'Gree Fairy 12', Помещение: 'Кухня' },
          },
        ],
      },
      {
        name: 'Хотел Морско око',
        kind: 'company',
        phones: ['+35952600700'],
        email: 'office@morsko-oko.example.com',
        address: 'Златни пясъци',
        items: [
          {
            name: 'Toshiba Seiya, стая 101',
            extra: { Модел: 'Toshiba Seiya', Помещение: 'Стая 101' },
          },
          {
            name: 'Toshiba Seiya, стая 102',
            extra: { Модел: 'Toshiba Seiya', Помещение: 'Стая 102' },
          },
          {
            name: 'Toshiba Seiya, рецепция',
            extra: { Модел: 'Toshiba Seiya', Помещение: 'Рецепция' },
          },
        ],
      },
    ],
    jobs: [
      {
        client: 'Георги Димитров',
        title: 'Профилактика на 2 климатика',
        stage: 'Насрочено',
        lines: [
          {
            description: 'Профилактика',
            quantity: 2,
            unitPriceCents: 5000,
            service: 'Профилактика',
          },
        ],
        createdDaysAgo: 5,
        items: ['Daikin FTXM35, хол', 'Mitsubishi MSZ-LN25, спалня'],
        appointment: {
          inDays: 0,
          hour: 10,
          minute: 30,
          hours: 2,
          label: 'Профилактика',
        },
      },
      {
        client: 'Хотел Морско око',
        title: 'Монтаж на нов климатик',
        stage: 'В работа',
        lines: [
          {
            description: 'Монтаж на климатик',
            quantity: 1,
            unitPriceCents: 15000,
            service: 'Монтаж на климатик',
          },
          {
            description: 'Зареждане с фреон',
            quantity: 1,
            unitPriceCents: 8000,
            service: 'Зареждане с фреон',
          },
        ],
        dueInDays: 1,
        createdDaysAgo: 3,
        items: ['Toshiba Seiya, рецепция'],
      },
      {
        client: 'Елена Иванова',
        title: 'Зареждане с фреон',
        stage: 'Изпълнено',
        typedPriceCents: 8000,
        createdDaysAgo: 4,
        doneDaysAgo: 3,
        items: ['Gree Fairy, кухня'],
      },
      {
        client: 'Георги Димитров',
        title: 'Профилактика',
        stage: 'Изпълнено',
        typedPriceCents: 5000,
        createdDaysAgo: 335,
        doneDaysAgo: 334,
        items: ['Daikin FTXM35, хол'],
        payments: [{ amountCents: 5000, daysAgo: 334, method: 'card' }],
      },
      {
        client: 'Хотел Морско око',
        title: 'Профилактика, 3 броя',
        stage: 'Изпълнено',
        lines: [
          {
            description: 'Профилактика',
            quantity: 3,
            unitPriceCents: 5000,
            service: 'Профилактика',
          },
        ],
        createdDaysAgo: 62,
        doneDaysAgo: 60,
        items: [
          'Toshiba Seiya, стая 101',
          'Toshiba Seiya, стая 102',
          'Toshiba Seiya, рецепция',
        ],
        payments: [{ amountCents: 15000, daysAgo: 55, method: 'bank' }],
      },
    ],
    reminders: [
      {
        client: 'Георги Димитров',
        item: 'Daikin FTXM35, хол',
        note: 'Годишна профилактика',
        inDays: 31,
        source: 'rule',
      },
      {
        client: 'Елена Иванова',
        note: 'Да се обадя за профилактика',
        inDays: -1,
        source: 'manual',
      },
      {
        client: 'Хотел Морско око',
        note: 'Оферта за 2 нови климатика',
        inDays: 0,
        source: 'manual',
      },
      {
        client: 'Георги Димитров',
        note: 'Да донеса филтри',
        inDays: -20,
        source: 'manual',
        status: 'done',
      },
    ],
  },
]
