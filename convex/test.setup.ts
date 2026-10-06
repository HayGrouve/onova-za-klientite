/// <reference types="vite/client" />
// Convex skips files with more than one dot, so this never deploys.
import { convexTest } from 'convex-test'
import schema from './schema'

// Function modules only: tests, this file and `.d.ts` all have extra dots.
export const modules = import.meta.glob([
  './**/*.ts',
  './_generated/*.js',
  '!./**/*.*.ts',
])

export function setupConvex() {
  return convexTest(schema, modules)
}

export type TestConvex = ReturnType<typeof setupConvex>

export const OWNER = {
  subject: 'user_owner',
  issuer: 'https://clerk.test',
  tokenIdentifier: 'https://clerk.test|user_owner',
  name: 'Иван Стоянов',
  email: 'ivan@example.com',
}

export const STRANGER = {
  subject: 'user_stranger',
  issuer: 'https://clerk.test',
  tokenIdentifier: 'https://clerk.test|user_stranger',
  name: 'Непознат',
  email: 'stranger@example.com',
}
