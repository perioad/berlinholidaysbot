/**
 * Outgoing text the bot can produce. Centralised so swapping wording later (or
 * adding i18n) is a one-file change.
 */
export const Messages = {
  Welcome: 'hello world',
  WelcomeBack: 'Welcome back!',
  AlreadyActive: 'You are already subscribed!',
} as const;
