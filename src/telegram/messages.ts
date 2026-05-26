/**
 * Outgoing text the bot can produce. Centralised so swapping wording later (or
 * adding i18n) is a one-file change.
 */
export const Messages = {
  /** Sent after a successful /start, both for new users and for users who
   *  reactivated after blocking the bot. Same casual German greeting for
   *  both branches - the distinction lives in the admin notification, not
   *  in what we say to the user. */
  Greeting: 'Hallöchen!',
  AlreadyActive: 'You are already subscribed!',
  /** Reply to any non-command text. The bot is broadcast-only, but we
   *  still forward the message to the admin channel so feedback isn't
   *  lost. */
  ChatNotSupported:
    "Chats aren't supported here, but feel free to send feedback or feature ideas — they'll be read.",
} as const;
