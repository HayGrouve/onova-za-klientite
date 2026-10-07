import {
  AddressBookIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { canPickContact, pickContact } from '#/lib/contacts'
import { m } from '#/paraglide/messages.js'
import { searchClients } from '../../../shared/search'
import type { ClientCandidate } from '../../../shared/search'
import type { ClientChoice } from '#/components/new-job/types'

/** Fixing the client: search the list, take a phone contact, add a new one, or none. */
export function ClientPicker({
  clients,
  initialQuery,
  onPick,
}: {
  clients: ClientCandidate[]
  initialQuery: string
  onPick: (choice: ClientChoice) => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [contactsSupported] = useState(canPickContact)
  const hits = searchClients(clients, query, 6)
  const typed = query.trim()

  return (
    <div className="flex flex-col gap-2">
      <InputGroup>
        <InputGroupAddon>
          <MagnifyingGlassIcon />
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          aria-label={m.new_search_placeholder()}
          placeholder={m.new_search_placeholder()}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </InputGroup>
      <div className="flex flex-wrap gap-2">
        {hits.map((client) => (
          <Button
            key={client.id}
            variant="outline"
            className="h-11 rounded-xl"
            onClick={() =>
              onPick({ kind: 'existing', id: client.id, name: client.name })
            }
          >
            {client.name}
          </Button>
        ))}
        {typed && !hits.some((client) => client.name === typed) && (
          <Button
            variant="outline"
            className="h-11 rounded-xl"
            onClick={() => onPick({ kind: 'new', name: typed })}
          >
            <PlusIcon data-icon="inline-start" />
            {m.new_create_client({ name: typed })}
          </Button>
        )}
        {contactsSupported && (
          <Button
            variant="outline"
            className="h-11 rounded-xl"
            onClick={() => {
              void pickContact().then((contact) => {
                if (contact) onPick({ kind: 'contact', ...contact })
              })
            }}
          >
            <AddressBookIcon data-icon="inline-start" />
            {m.new_pick_contact()}
          </Button>
        )}
        <Button
          variant="ghost"
          className="h-11 rounded-xl"
          onClick={() => onPick({ kind: 'none' })}
        >
          {m.no_client()}
        </Button>
      </div>
    </div>
  )
}
