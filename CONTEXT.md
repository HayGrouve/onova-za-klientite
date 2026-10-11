# Онова за клиентите

A phone-first app for small service businesses in Bulgaria to keep track of clients, jobs and money. One fixed core fits any trade; each business only changes the words, the modules it sees, its extra fields and its stages.

Each term below gives the English name used in code and docs, then the Bulgarian word the UI shows. Words marked _renamable_ are only defaults: each business can pick its own.

## Flows

**First run:** sign in → **Setup** (eight questions, Job form shown live) → **Today**.

**Logging work:** "+" → one line such as "Иван Петров, гардероб, 950, капаро 300, до 20.10" → read back as **Client**, title, **Price**, **Deposit** and **Due date** → saved as a **Job** in its first **Stage**.

**Getting paid:** a **Payment** from a Job is allocated to it, and any rest becomes **Client credit**. A Payment from a Client is split across their Jobs. A **Refund** is a negative Payment, and a **Write-off** closes what will never be paid.

**Following up:** a Job reaching the *Done* group → the **Reminder rule** suggests a **Reminder** N months later. A **Repeat** creates the next Job on its schedule.

## Language

### Who

**Business** · UI: _Бизнес_
The workspace that owns every other record. A person can belong to several businesses and switch between them. Only its Owner can delete it, by typing its name; everything in it goes too.
_Avoid_: company, account, organisation, workspace, tenant

**User** · UI: _Профил_
A person who signs in. A user takes part in a business only through a Membership.
_Avoid_: member, owner (those are Memberships), customer

**Membership** · UI: _Член на екипа_
A user's place in one business, with one Role. Deactivated, never deleted, so history keeps the name.
_Avoid_: employee, staff, seat

**Role** · UI: _Роля_ (_Собственик_, _Управител_, _Работник_)
What a Membership may do in its business: Owner, Manager or Worker. A Level 1 business has a single Owner.
_Avoid_: permission, admin

**Client** · UI: _Клиент_ (renamable)
A person or company the business serves, and the owner of its Jobs, Items, Payments and Reminders.
_Avoid_: customer, contact, buyer, account

**No client** · UI: _Без клиент_
The one built-in Client each business has for walk-ins, so every Job and Payment still has a Client.
_Avoid_: anonymous, walk-in client, empty client

**Phone contact** · UI: _Контакт от телефона_
An entry in the user's phone address book. Choosing it creates a Client; it is never a Client by itself.
_Avoid_: client, lead

### Work

**Job** · UI: _Поръчка_ (renamable)
One piece of work for one Client, from first contact to done. It carries the title, stage, price, due date, address, notes and files.
_Avoid_: order, task, ticket, visit, project, work order

**Job line** · UI: _Позиция_
One charged line on a Job: description, quantity and unit price. When a Job has lines, its price is their sum.
_Avoid_: line item, invoice line, row

**Service** · UI: _Услуга_
A saved service or product with a default price, picked when filling in a Job.
_Avoid_: product, catalogue item, price list entry

**Stage** · UI: _Етап_
A named step a Job is at, from the business's single stage list. Jobs may skip stages or move back.
_Avoid_: status, state, column, step

**Stage group** · UI: _Нови_, _В процес_, _Готови_, _Отказани_
One of four fixed buckets every Stage belongs to: New, In progress, Done, Cancelled. Lists and money read the group, never the stage name.
_Avoid_: status, category

**Board** · UI: _Табло_
The Jobs screen on a wide screen: one column per Stage group, a card per Job. Moving a card changes its Stage. The other Jobs view there is the table, one Stage group at a time.
_Avoid_: kanban, pipeline, column (for a Stage)

**Due date** · UI: _Срок_
The date promised to the client for a Job. Optional, and separate from Appointments.
_Avoid_: deadline, end date

**Appointment** · UI: _Среща_ (renamable)
A date or time slot, usually on a Job, with an optional label such as "Оглед". In Level 2 it may have no Job (blocked time).
_Avoid_: event, booking, visit, slot

**Item** · UI: _Обект_ (renamable)
A thing the client owns that work is done on: a car, a device, a property, an animal. It can move to another Client and keep its history.
_Avoid_: asset, equipment, vehicle, object

**Repeat** · UI: _Повтаряне_
A schedule on a Job that creates the next Job when it is due. Each Job in the series keeps its own price and payments.
_Avoid_: recurrence, subscription, series

**Reminder** · UI: _Напомняне_
A follow-up date with a note, linked to a Client, Job or Item.
_Avoid_: task, alert, notification

**Reminder rule** · UI: _Правило за напомняне_
The single automation: when a Job is done, suggest a Reminder N months later.
_Avoid_: automation, workflow, trigger

**File** · UI: _Снимка_ or _Файл_
A photo or document attached to a Job, Client or Item.
_Avoid_: attachment, upload, media

### Money

**Price** · UI: _Цена_
What a Job costs the client: the sum of its Job lines, or typed when it has none. Never typed when lines exist.
_Avoid_: amount, total, quote

**Payment** · UI: _Плащане_
Money received from a Client on one date, by one Payment method. It belongs to the Client and is split across that client's Jobs.
_Avoid_: transaction, receipt, invoice

**Payment method** · UI: _В брой_, _По банка_, _С карта_, _Друго_
How a Payment arrived: cash, bank transfer, card or other. A fixed list.
_Avoid_: channel, payment type

**Deposit** · UI: _Капаро_
A Payment taken before the work is done, labelled as such. Not a separate kind of money.
_Avoid_: advance, prepayment (as the term), down payment

**Refund** · UI: _Връщане_
A negative Payment.
_Avoid_: reversal, credit note, cancellation

**Allocation** · UI: _за_ (as in "300 € за Гардероб")
The part of a Payment applied to one Job.
_Avoid_: split, assignment

**Balance** · UI: _Остатък_
What is still unpaid on a Job: its Price minus its Allocations and any Write-off.
_Avoid_: debt, amount due, outstanding

**Client credit** · UI: _Предплатено_
The part of a Client's Payments not yet allocated to any Job.
_Avoid_: credit, deposit, overpayment, balance

**Write-off** · UI: _Отписване_
Closing the unpaid rest of a Job's Balance for good, with a note.
_Avoid_: discount, cancellation, bad debt

**Cost** · UI: _Разход_
Money the business spent, either on one Job or general (rent, fuel, tools).
_Avoid_: expense (in code use Cost), purchase

**Job profit** · UI: _Печалба_
A Job's Allocations minus its Costs.
_Avoid_: margin, earnings

**Monthly profit** · UI: _Печалба за месеца_
Payments received in a month minus all Costs in that month, general ones included.
_Avoid_: revenue, income, net

**Who owes me** · UI: _Кой ми дължи_
The Clients with Jobs that still have a Balance.
_Avoid_: debtors, receivables

**Job summary** · UI: _Обобщение_ (marked _Това не е фактура_)
A shareable image of one Job: lines, price, deposit and balance. Never a legal or fiscal document.
_Avoid_: invoice, receipt, quote, offer

### Customization

**Word** · UI: _Име_
The noun a business uses for Client, Job, Item or Appointment: singular, plural and grammatical gender.
_Avoid_: label, alias, translation

**Module** · UI: _Модул_
An optional building block a business can switch on or off: Appointments, Costs, Items, Reminders, Service list. Off hides it and its data, never deletes them.
_Avoid_: feature, plugin, add-on

**Extra field** · UI: _Поле_ (as in "+ поле")
A field a business adds to Clients, Jobs or Items, of one of eight types. Archived, never deleted, once it holds data.
_Avoid_: custom field, attribute, property

**Field type** · UI: _Текст_, _Дълъг текст_, _Число_, _Сума_, _Дата_, _Да/Не_, _Избор_, _Снимка_
One of the eight fixed kinds of Extra field: text, long text, number, money, date, yes/no, choice, photo.
_Avoid_: data type, format

**Choice option** · UI: _Опция_
One answer of a choice field. Records point at the option, so a rename shows everywhere.
_Avoid_: value, enum

**Setup** · UI: _Настройка_
The eight-question wizard that turns how a person works into settings, with the Job form shown live. It can be run again from Settings.
_Avoid_: onboarding, wizard (in the UI), template, preset

**Job flow** · UI: _Наведнъж_ or _На етапи_
The setup answer for how a typical Job goes: one visit and done, or several steps over days or weeks. It picks the starting Stages and whether a new Job asks "when" or "by when".
_Avoid_: workflow, process, pipeline

### Records and history

**Activity** · UI: _История_
The log of every change as an event (job created, stage changed, payment added). It feeds the Job, Client and Item timelines.
_Avoid_: audit log, changelog, feed

**Today** · UI: _Днес_
The home list of what to act on: today's appointments, overdue and soon-due Jobs, Reminders due and done-but-unpaid Jobs. A wide screen adds a row of headline figures and puts the schedule beside the rest.
_Avoid_: dashboard, home, inbox

**Overdue** · UI: _Закъснели_
A Job past its Due date that is still in the New or In progress group.
_Avoid_: late, expired

**Search** · UI: _Търсене_
One box over everything: Latin and Cyrillic, plate look-alike letters, spaces ignored, extra fields included.
_Avoid_: filter, lookup

**Duplicate** · UI: _Дубликат_
Two Clients sharing a phone number. They can be merged into one.
_Avoid_: copy, clone

**Anonymize** · UI: _Анонимизирай_
Removing a Client's name and contacts on request while keeping their Jobs and money.
_Avoid_: delete (a Client is never deleted this way), redact

### Customer-ready (stored now, used later)

**Contact preferences** · UI: _Предпочитан канал_
A Client's phones, email and preferred channel: phone, Viber, SMS or email.
_Avoid_: contact info, settings

**Consent** · UI: _Съгласие_
A Client's separate yes or no for service messages and for marketing, each with the date given.
_Avoid_: opt-in, permission, subscription

**Share link** · UI: _Връзка за споделяне_
An unguessable link to one Job or Client with a permission (view, approve, book), an expiry and a cancelled date.
_Avoid_: public link, token, magic link

**Visible to client** · UI: _Вижда се от клиента_
A flag on Extra fields, Files and Stages, with an optional client-facing Stage name.
_Avoid_: public, shared, published

**Message** · UI: _Съобщение_
One entry in a Client's messages log: channel, recipient, template, delivery status and related Job. In Level 1 it records a manual contact.
_Avoid_: notification, chat, SMS (as the term)

**Job source** · UI: _Източник_ (_Ръчно_, _Телефон_, _Онлайн_)
How a Job came in: manual, phone or online.
_Avoid_: channel, origin, lead source

### Levels

**Level 1** · no UI word
One person on a phone, running one or more businesses alone.
_Avoid_: free plan, solo plan (plans are about price, levels are about features)

**Level 2** · no UI word
A business with a team. It starts when the Owner invites the first teammate.
_Avoid_: team plan, pro, enterprise

**Assignee** · UI: _Изпълнител_
A Membership a Job or Appointment is given to. Several per Job or Appointment, Level 2 only.
_Avoid_: owner, responsible, worker (that is a Role)

**Resource** · UI: _Ресурс_
Something bookable that isn't a person: a bay, room, machine or van. Level 2 only.
_Avoid_: asset, equipment

**Time entry** · UI: _Отработено време_
Work time by one person on one Job. Level 2 only.
_Avoid_: timesheet, hours, shift

## Related docs

- `docs/product-design.md`: the product design. It wins over everything else
- `docs/implementation-plan.md`: schema draft, milestones, open questions, build decisions
- `docs/adr/`: stack and architecture decisions
- `AGENTS.md`: how to run, test and verify
