## Default Permission

Allows all store plugin commands

#### This default permission set includes the following:

- `allow-initialize`
- `allow-get-meta`
- `allow-get-stats`
- `allow-rebuild`
- `allow-rebuild-fts`
- `allow-get-indexed-ids`
- `allow-meetings-list`
- `allow-meetings-get`
- `allow-meetings-upsert`
- `allow-meetings-delete`
- `allow-meetings-create`
- `allow-meetings-set-status`
- `allow-meetings-begin-step`
- `allow-meetings-end-step`
- `allow-meetings-rename`
- `allow-transcripts-save`
- `allow-summaries-save`
- `allow-recordings-upsert`
- `allow-recordings-list-for-meeting`
- `allow-recordings-list-orphan`
- `allow-recordings-delete`
- `allow-categories-list`
- `allow-categories-rename`
- `allow-categories-create`
- `allow-categories-delete`
- `allow-chats-list`
- `allow-chats-get`
- `allow-chats-upsert`
- `allow-chats-rename`
- `allow-chats-delete`
- `allow-dictations-list`
- `allow-dictations-create`
- `allow-dictations-delete`
- `allow-notes-list`
- `allow-notes-upsert`
- `allow-notes-delete`
- `allow-todos-list-for-meeting`
- `allow-todos-list-global`
- `allow-todos-get`
- `allow-todos-upsert`
- `allow-todos-set-completed`
- `allow-todos-delete`
- `allow-reminders-upsert`
- `allow-reminders-set-status`
- `allow-reminders-due`
- `allow-reminders-prune`
- `allow-settings-get-all`
- `allow-settings-set`
- `allow-providers-list`
- `allow-providers-upsert`
- `allow-providers-set-active`
- `allow-providers-delete`
- `allow-upsert-meeting-index`
- `allow-upsert-chunks`
- `allow-meetings-search`
- `allow-get-stale-meetings`
- `allow-get-meetings-needing-embeddings`
- `allow-mark-meeting-embedded`
- `allow-mark-meeting-content-indexed`
- `allow-mark-chat-content-indexed`
- `allow-mark-chat-indexed`
- `allow-upsert-chat-chunks`
- `allow-delete-chat-session`
- `allow-chat-is-stale`
- `allow-chats-get-stale`
- `allow-get-chats-needing-embeddings`
- `allow-mark-chat-embedded`
- `allow-chats-search`
- `allow-search-sessions`
- `allow-insert-usage`
- `allow-get-usage-summary`
- `allow-get-meeting-usage`

## Permission Table

<table>
<tr>
<th>Identifier</th>
<th>Description</th>
</tr>


<tr>
<td>

`store:allow-categories-create`

</td>
<td>

Enables the categories_create command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-categories-create`

</td>
<td>

Denies the categories_create command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-categories-delete`

</td>
<td>

Enables the categories_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-categories-delete`

</td>
<td>

Denies the categories_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-categories-list`

</td>
<td>

Enables the categories_list command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-categories-list`

</td>
<td>

Denies the categories_list command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-categories-rename`

</td>
<td>

Enables the categories_rename command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-categories-rename`

</td>
<td>

Denies the categories_rename command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-chat-is-stale`

</td>
<td>

Enables the chat_is_stale command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-chat-is-stale`

</td>
<td>

Denies the chat_is_stale command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-chats-delete`

</td>
<td>

Enables the chats_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-chats-delete`

</td>
<td>

Denies the chats_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-chats-get`

</td>
<td>

Enables the chats_get command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-chats-get`

</td>
<td>

Denies the chats_get command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-chats-get-stale`

</td>
<td>

Enables the chats_get_stale command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-chats-get-stale`

</td>
<td>

Denies the chats_get_stale command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-chats-list`

</td>
<td>

Enables the chats_list command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-chats-list`

</td>
<td>

Denies the chats_list command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-chats-rename`

</td>
<td>

Enables the chats_rename command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-chats-rename`

</td>
<td>

Denies the chats_rename command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-chats-search`

</td>
<td>

Enables the chats_search command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-chats-search`

</td>
<td>

Denies the chats_search command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-chats-upsert`

</td>
<td>

Enables the chats_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-chats-upsert`

</td>
<td>

Denies the chats_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-delete-chat-session`

</td>
<td>

Enables the delete_chat_session command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-delete-chat-session`

</td>
<td>

Denies the delete_chat_session command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-dictations-create`

</td>
<td>

Enables the dictations_create command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-dictations-create`

</td>
<td>

Denies the dictations_create command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-dictations-delete`

</td>
<td>

Enables the dictations_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-dictations-delete`

</td>
<td>

Denies the dictations_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-dictations-list`

</td>
<td>

Enables the dictations_list command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-dictations-list`

</td>
<td>

Denies the dictations_list command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-get-chats-needing-embeddings`

</td>
<td>

Enables the get_chats_needing_embeddings command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-get-chats-needing-embeddings`

</td>
<td>

Denies the get_chats_needing_embeddings command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-get-indexed-ids`

</td>
<td>

Enables the get_indexed_ids command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-get-indexed-ids`

</td>
<td>

Denies the get_indexed_ids command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-get-meeting-usage`

</td>
<td>

Enables the get_meeting_usage command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-get-meeting-usage`

</td>
<td>

Denies the get_meeting_usage command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-get-meetings-needing-embeddings`

</td>
<td>

Enables the get_meetings_needing_embeddings command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-get-meetings-needing-embeddings`

</td>
<td>

Denies the get_meetings_needing_embeddings command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-get-meta`

</td>
<td>

Enables the get_meta command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-get-meta`

</td>
<td>

Denies the get_meta command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-get-stale-meetings`

</td>
<td>

Enables the get_stale_meetings command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-get-stale-meetings`

</td>
<td>

Denies the get_stale_meetings command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-get-stats`

</td>
<td>

Enables the get_stats command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-get-stats`

</td>
<td>

Denies the get_stats command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-get-usage-summary`

</td>
<td>

Enables the get_usage_summary command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-get-usage-summary`

</td>
<td>

Denies the get_usage_summary command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-initialize`

</td>
<td>

Enables the initialize command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-initialize`

</td>
<td>

Denies the initialize command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-insert-usage`

</td>
<td>

Enables the insert_usage command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-insert-usage`

</td>
<td>

Denies the insert_usage command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-mark-chat-content-indexed`

</td>
<td>

Enables the mark_chat_content_indexed command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-mark-chat-content-indexed`

</td>
<td>

Denies the mark_chat_content_indexed command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-mark-chat-embedded`

</td>
<td>

Enables the mark_chat_embedded command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-mark-chat-embedded`

</td>
<td>

Denies the mark_chat_embedded command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-mark-chat-indexed`

</td>
<td>

Enables the mark_chat_indexed command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-mark-chat-indexed`

</td>
<td>

Denies the mark_chat_indexed command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-mark-meeting-content-indexed`

</td>
<td>

Enables the mark_meeting_content_indexed command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-mark-meeting-content-indexed`

</td>
<td>

Denies the mark_meeting_content_indexed command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-mark-meeting-embedded`

</td>
<td>

Enables the mark_meeting_embedded command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-mark-meeting-embedded`

</td>
<td>

Denies the mark_meeting_embedded command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-meetings-begin-step`

</td>
<td>

Enables the meetings_begin_step command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-meetings-begin-step`

</td>
<td>

Denies the meetings_begin_step command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-meetings-create`

</td>
<td>

Enables the meetings_create command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-meetings-create`

</td>
<td>

Denies the meetings_create command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-meetings-delete`

</td>
<td>

Enables the meetings_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-meetings-delete`

</td>
<td>

Denies the meetings_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-meetings-end-step`

</td>
<td>

Enables the meetings_end_step command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-meetings-end-step`

</td>
<td>

Denies the meetings_end_step command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-meetings-get`

</td>
<td>

Enables the meetings_get command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-meetings-get`

</td>
<td>

Denies the meetings_get command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-meetings-list`

</td>
<td>

Enables the meetings_list command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-meetings-list`

</td>
<td>

Denies the meetings_list command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-meetings-rename`

</td>
<td>

Enables the meetings_rename command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-meetings-rename`

</td>
<td>

Denies the meetings_rename command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-meetings-search`

</td>
<td>

Enables the meetings_search command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-meetings-search`

</td>
<td>

Denies the meetings_search command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-meetings-set-status`

</td>
<td>

Enables the meetings_set_status command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-meetings-set-status`

</td>
<td>

Denies the meetings_set_status command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-meetings-upsert`

</td>
<td>

Enables the meetings_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-meetings-upsert`

</td>
<td>

Denies the meetings_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-notes-delete`

</td>
<td>

Enables the notes_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-notes-delete`

</td>
<td>

Denies the notes_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-notes-list`

</td>
<td>

Enables the notes_list command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-notes-list`

</td>
<td>

Denies the notes_list command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-notes-upsert`

</td>
<td>

Enables the notes_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-notes-upsert`

</td>
<td>

Denies the notes_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-providers-delete`

</td>
<td>

Enables the providers_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-providers-delete`

</td>
<td>

Denies the providers_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-providers-list`

</td>
<td>

Enables the providers_list command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-providers-list`

</td>
<td>

Denies the providers_list command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-providers-set-active`

</td>
<td>

Enables the providers_set_active command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-providers-set-active`

</td>
<td>

Denies the providers_set_active command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-providers-upsert`

</td>
<td>

Enables the providers_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-providers-upsert`

</td>
<td>

Denies the providers_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-rebuild`

</td>
<td>

Enables the rebuild command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-rebuild`

</td>
<td>

Denies the rebuild command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-rebuild-fts`

</td>
<td>

Enables the rebuild_fts command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-rebuild-fts`

</td>
<td>

Denies the rebuild_fts command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-recordings-delete`

</td>
<td>

Enables the recordings_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-recordings-delete`

</td>
<td>

Denies the recordings_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-recordings-list-for-meeting`

</td>
<td>

Enables the recordings_list_for_meeting command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-recordings-list-for-meeting`

</td>
<td>

Denies the recordings_list_for_meeting command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-recordings-list-orphan`

</td>
<td>

Enables the recordings_list_orphan command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-recordings-list-orphan`

</td>
<td>

Denies the recordings_list_orphan command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-recordings-upsert`

</td>
<td>

Enables the recordings_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-recordings-upsert`

</td>
<td>

Denies the recordings_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-reminders-due`

</td>
<td>

Enables the reminders_due command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-reminders-due`

</td>
<td>

Denies the reminders_due command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-reminders-prune`

</td>
<td>

Enables the reminders_prune command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-reminders-prune`

</td>
<td>

Denies the reminders_prune command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-reminders-set-status`

</td>
<td>

Enables the reminders_set_status command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-reminders-set-status`

</td>
<td>

Denies the reminders_set_status command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-reminders-upsert`

</td>
<td>

Enables the reminders_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-reminders-upsert`

</td>
<td>

Denies the reminders_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-search-sessions`

</td>
<td>

Enables the search_sessions command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-search-sessions`

</td>
<td>

Denies the search_sessions command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-settings-get-all`

</td>
<td>

Enables the settings_get_all command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-settings-get-all`

</td>
<td>

Denies the settings_get_all command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-settings-set`

</td>
<td>

Enables the settings_set command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-settings-set`

</td>
<td>

Denies the settings_set command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-summaries-save`

</td>
<td>

Enables the summaries_save command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-summaries-save`

</td>
<td>

Denies the summaries_save command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-todos-delete`

</td>
<td>

Enables the todos_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-todos-delete`

</td>
<td>

Denies the todos_delete command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-todos-get`

</td>
<td>

Enables the todos_get command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-todos-get`

</td>
<td>

Denies the todos_get command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-todos-list-for-meeting`

</td>
<td>

Enables the todos_list_for_meeting command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-todos-list-for-meeting`

</td>
<td>

Denies the todos_list_for_meeting command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-todos-list-global`

</td>
<td>

Enables the todos_list_global command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-todos-list-global`

</td>
<td>

Denies the todos_list_global command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-todos-set-completed`

</td>
<td>

Enables the todos_set_completed command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-todos-set-completed`

</td>
<td>

Denies the todos_set_completed command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-todos-upsert`

</td>
<td>

Enables the todos_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-todos-upsert`

</td>
<td>

Denies the todos_upsert command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-transcripts-save`

</td>
<td>

Enables the transcripts_save command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-transcripts-save`

</td>
<td>

Denies the transcripts_save command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-upsert-chat-chunks`

</td>
<td>

Enables the upsert_chat_chunks command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-upsert-chat-chunks`

</td>
<td>

Denies the upsert_chat_chunks command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-upsert-chunks`

</td>
<td>

Enables the upsert_chunks command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-upsert-chunks`

</td>
<td>

Denies the upsert_chunks command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:allow-upsert-meeting-index`

</td>
<td>

Enables the upsert_meeting_index command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`store:deny-upsert-meeting-index`

</td>
<td>

Denies the upsert_meeting_index command without any pre-configured scope.

</td>
</tr>
</table>
