-- Game-generated chat lines (rolls, casts, reactions from the board's quick-action
-- panel) are told apart from what players type, so the chat can style them as a log.
alter table public.messages
  add column kind text not null default 'chat'
  constraint messages_kind check (kind in ('chat', 'action'));
