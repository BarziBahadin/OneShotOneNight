-- Keep the application and Storage validation limits aligned. Supabase's
-- resumable-upload guidance uses 6 MB as a recommendation, not a hard limit;
-- signed uploads in this app can accept media up to 100 MB.
update storage.buckets
set file_size_limit = 104857600
where id = 'oneshotonenight';
