-- Run AFTER portal-auth.sql. All test changes are rolled back.
begin;
do $$
declare
  admin_id uuid;
  employee_id uuid;
  email_value text := 'sso-check-' || replace(gen_random_uuid()::text,'-','') || '@satgurutravel.com';
  sub_value text := replace(gen_random_uuid()::text,'-','');
  ch text := md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text);
  sh text := md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text);
  ch2 text := md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text);
  sh2 text := md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text);
  nonce_value text := repeat('n',43);
  result jsonb;
begin
  select id into admin_id from public.notion_portal_users
  where email='avinash.damale@satgurutravel.com' and role='super_admin' and status='approved';
  assert admin_id is not null, 'First approved administrator is missing';
  assert not has_table_privilege('anon','public.notion_portal_users','select'), 'Anonymous table access exists';
  assert not has_table_privilege('authenticated','public.notion_portal_users','update'), 'Authenticated writes exist';
  assert not has_function_privilege('anon','public.notion_portal_login(text,text,text,text,text,text,text)','execute'), 'Anonymous login RPC access exists';
  assert not has_function_privilege('authenticated','public.notion_portal_review(uuid,uuid,text)','execute'), 'Authenticated review RPC access exists';
  perform public.notion_portal_challenge(ch,nonce_value);
  result := public.notion_portal_login(ch,nonce_value,sub_value,email_value,'SSO test',sh,null);
  employee_id := (result->>'id')::uuid;
  assert result->>'status'='pending', 'New user was not pending';
  assert result->>'role'='user', 'New user escalated privileges';
  begin
    perform public.notion_portal_login(ch,nonce_value,sub_value,email_value,'SSO test',sh2,null);
    raise exception 'Replay was accepted';
  exception when others then if sqlerrm <> 'invalid_challenge' then raise; end if; end;
  perform public.notion_portal_challenge(ch2,nonce_value);
  result := public.notion_portal_login(ch2,nonce_value,sub_value,email_value,'SSO test',sh2,sh);
  assert (result->>'id')::uuid=employee_id, 'Repeated login duplicated user';
  assert result->>'status'='pending', 'Repeated login bypassed approval';
  assert public.notion_portal_session(sh) is null, 'Rotated session not removed';
  begin
    perform public.notion_portal_review(employee_id,employee_id,'approve');
    raise exception 'Ordinary user approved themselves';
  exception when others then if sqlerrm <> 'admin_required' then raise; end if; end;
  result := public.notion_portal_review(admin_id,employee_id,'approve');
  assert result->>'status'='approved', 'Approval failed';
  assert public.notion_portal_session(sh2)->>'status'='approved', 'Approval not reflected';
  result := public.notion_portal_review(admin_id,employee_id,'revoke');
  assert result->>'status'='revoked', 'Revocation failed';
  assert public.notion_portal_session(sh2) is null, 'Revocation did not invalidate session';
  perform public.notion_portal_challenge(ch,nonce_value);
  result := public.notion_portal_login(ch,nonce_value,sub_value,email_value,'SSO test',sh,null);
  assert result->>'status'='revoked', 'Re-login bypassed revocation';
  begin
    perform public.notion_portal_review(admin_id,admin_id,'revoke');
    raise exception 'First administrator was revocable';
  exception when others then if sqlerrm <> 'protected_admin' then raise; end if; end;
  assert (select count(*)=1 from public.notion_portal_audit where user_id=employee_id and event='access_requested'), 'Request audit duplicated';
  assert (select count(*)=1 from public.notion_portal_audit where user_id=employee_id and event='approve'), 'Approval audit missing';
  assert (select count(*)=1 from public.notion_portal_audit where user_id=employee_id and event='revoke'), 'Revocation audit missing';
  result := public.notion_portal_list_users(admin_id,0);
  assert result ? 'users', 'Approval queue failed';
  raise notice 'Database smoke checks passed. All test changes will roll back.';
end $$;
rollback;
