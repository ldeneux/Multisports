-- ============================================================================
-- Sport Famille — stockage des documents (photos de diplômes/licences)
-- À exécuter APRÈS schema.sql, dans le SQL Editor de Supabase.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

create policy "authenticated_upload_documents"
on storage.objects for insert
with check (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "authenticated_manage_documents"
on storage.objects for update
using (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "authenticated_delete_documents"
on storage.objects for delete
using (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "public_read_documents"
on storage.objects for select
using (bucket_id = 'documents');
