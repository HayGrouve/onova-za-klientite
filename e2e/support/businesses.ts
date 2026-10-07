import type { Answers } from './app'

/**
 * The six unrelated businesses of the design doc's genericity check
 * (docs/product-design.md). Each is built from the setup wizard answers and
 * Settings alone. These are test cases, not presets.
 */
export type Business = {
  /** What the doc calls it. */
  title: string
  answers: Answers & { name: string }
  /** The word for a job, as the app should now show it. */
  job: { singular: string; plural: string }
  /** Stage renames made in Settings → Етапи, in order. */
  renames: Array<[from: string, to: string]>
  /** All stages in order after the renames, the hidden "Отказано" last. */
  stages: string[]
  deposits: boolean
  costs: boolean
  /** The thing the client owns, and the fields its form should offer. */
  item?: { singular: string; plural: string; fields: string[] }
  /** Settings → Имена: the item's plural when the wizard's guess is wrong. */
  itemPlural?: string
  /** Settings → Полета: item fields the wizard doesn't suggest. */
  addItemFields?: string[]
  /** The reminder rule's pressed choice in Settings → Напомняния; absent means off. */
  reminder?: string
  /** The repeat default's label; absent means jobs don't repeat by default. */
  repeat?: string
  /** One line for "+", its client, and the job title as it shows afterwards. */
  line: string
  client: string
  jobTitle: string
}

const IN_STAGES = ['Отказано']

export const BUSINESSES: Business[] = [
  {
    title: 'furniture maker: stages, deposits and costs',
    answers: {
      name: 'Мебели Е2Е',
      job: 'Поръчка',
      flow: 'multi',
      item: false,
      deposits: true,
      costs: true,
      repeat: 'none',
    },
    job: { singular: 'Поръчка', plural: 'Поръчки' },
    // The wizard's "На етапи" gives Запитване, Оглед, В работа, Готово.
    renames: [
      ['Оглед', 'Изработка'],
      ['В работа', 'Монтаж'],
      ['Запитване', 'Оглед'],
    ],
    stages: ['Оглед', 'Изработка', 'Монтаж', 'Готово', ...IN_STAGES],
    deposits: true,
    costs: true,
    line: 'Мария Колева, кухня, 2400, капаро 800, до 20.10',
    client: 'Мария Колева',
    jobTitle: 'Кухня',
  },
  {
    title: 'car repair shop: item, reminders every few months',
    answers: {
      name: 'Автосервиз Е2Е',
      job: 'Ремонт',
      flow: 'multi',
      item: { kind: 'Автомобил' },
      costs: true,
      repeat: { months: 'След 6 месеца' },
    },
    job: { singular: 'Ремонт', plural: 'Ремонти' },
    renames: [
      ['Запитване', 'Приет'],
      ['Оглед', 'В ремонт'],
      ['В работа', 'Чака части'],
      ['Готово', 'Готов'],
    ],
    stages: ['Приет', 'В ремонт', 'Чака части', 'Готов', ...IN_STAGES],
    deposits: false,
    costs: true,
    item: {
      singular: 'Автомобил',
      plural: 'Автомобили',
      fields: ['Рег. номер', 'Марка и модел', 'Пробег'],
    },
    reminder: 'След 6 месеца',
    line: 'Георги Тодоров, смяна на масло, 90, до 20.10',
    client: 'Георги Тодоров',
    jobTitle: 'Смяна на масло',
  },
  {
    title: 'AC technician: item, one visit, reminders',
    answers: {
      name: 'Климатици Е2Е',
      job: 'Посещение',
      flow: 'single',
      item: { kind: 'Климатик' },
      costs: false,
      repeat: { months: 'След година' },
    },
    job: { singular: 'Посещение', plural: 'Посещения' },
    // Насрочено → (В работа, which stays unused) → Изпълнено.
    renames: [['Готово', 'Изпълнено']],
    stages: ['Насрочено', 'В работа', 'Изпълнено', ...IN_STAGES],
    deposits: false,
    costs: false,
    item: {
      singular: 'Климатик',
      plural: 'Климатици',
      fields: ['Модел', 'Помещение'],
    },
    reminder: 'След година',
    line: 'Николай Димитров, почистване на климатик, 60, утре 10:00',
    client: 'Николай Димитров',
    jobTitle: 'Почистване на климатик',
  },
  {
    title: 'mobile dog groomer: own item word, own fields, reminders',
    answers: {
      name: 'Кучешки салон Е2Е',
      job: 'Посещение',
      flow: 'single',
      item: { own: 'Куче' },
      costs: false,
      repeat: { months: 'След 3 месеца' },
    },
    job: { singular: 'Посещение', plural: 'Посещения' },
    renames: [],
    stages: ['Насрочено', 'В работа', 'Готово', ...IN_STAGES],
    deposits: false,
    costs: false,
    // "Друго" offers Модел and Бележка; Порода and Характер are added in
    // Settings → Полета, and the plural the wizard guessed is fixed in Имена.
    item: {
      singular: 'Куче',
      plural: 'Кучета',
      fields: ['Модел', 'Бележка', 'Порода', 'Характер'],
    },
    itemPlural: 'Кучета',
    addItemFields: ['Порода', 'Характер'],
    reminder: 'След 3 месеца',
    line: 'Елена Маринова, подстригване, 45, утре 10:00',
    client: 'Елена Маринова',
    jobTitle: 'Подстригване',
  },
  {
    title: 'tutor: own word, one lesson at a time',
    answers: {
      name: 'Уроци Е2Е',
      job: { own: 'Урок', plural: 'Уроци' },
      flow: 'single',
      item: false,
      costs: false,
      repeat: 'none',
    },
    job: { singular: 'Урок', plural: 'Уроци' },
    renames: [
      ['Насрочено', 'Насрочен'],
      ['Готово', 'Проведен'],
    ],
    stages: ['Насрочен', 'В работа', 'Проведен', ...IN_STAGES],
    deposits: false,
    costs: false,
    line: 'Петя Стоянова, математика, 30, утре 10:00',
    client: 'Петя Стоянова',
    jobTitle: 'Математика',
  },
  {
    title: 'office cleaner: own word, repeats weekly by default',
    answers: {
      name: 'Чистота Е2Е',
      job: { own: 'Почистване', plural: 'Почиствания' },
      flow: 'single',
      item: false,
      costs: false,
      repeat: { schedule: 'Всяка седмица' },
    },
    job: { singular: 'Почистване', plural: 'Почиствания' },
    renames: [],
    stages: ['Насрочено', 'В работа', 'Готово', ...IN_STAGES],
    deposits: false,
    costs: false,
    repeat: 'Всяка седмица',
    line: 'Фирма Лотос, офис, 120, утре 10:00',
    client: 'Фирма Лотос',
    jobTitle: 'Офис',
  },
]
