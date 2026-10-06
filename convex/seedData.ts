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

export type SeedBusiness = {
  key: string
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
  },
]
