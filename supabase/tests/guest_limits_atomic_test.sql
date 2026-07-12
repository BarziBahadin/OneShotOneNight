BEGIN;
SELECT plan(6);

SELECT has_function(
  'public',
  'find_or_create_guest_atomic',
  ARRAY['text', 'text', 'text', 'boolean'],
  'atomic guest creation function exists'
);

SELECT has_function(
  'public',
  'complete_guest_photo_atomic',
  ARRAY['text', 'text', 'text', 'text', 'integer', 'integer'],
  'atomic photo completion function exists'
);

SELECT function_privs_are(
  'public',
  'find_or_create_guest_atomic',
  ARRAY['text', 'text', 'text', 'boolean'],
  'anon',
  ARRAY[]::text[],
  'anon cannot execute guest creation'
);

SELECT function_privs_are(
  'public',
  'complete_guest_photo_atomic',
  ARRAY['text', 'text', 'text', 'text', 'integer', 'integer'],
  'authenticated',
  ARRAY[]::text[],
  'authenticated cannot execute photo completion'
);

SELECT function_privs_are(
  'public',
  'find_or_create_guest_atomic',
  ARRAY['text', 'text', 'text', 'boolean'],
  'service_role',
  ARRAY['EXECUTE'],
  'service role can execute guest creation'
);

SELECT function_privs_are(
  'public',
  'complete_guest_photo_atomic',
  ARRAY['text', 'text', 'text', 'text', 'integer', 'integer'],
  'service_role',
  ARRAY['EXECUTE'],
  'service role can execute photo completion'
);

SELECT * FROM finish();
ROLLBACK;
