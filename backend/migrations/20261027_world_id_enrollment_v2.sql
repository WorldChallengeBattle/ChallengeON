BEGIN;
LOCK TABLE world_id_human_login_requests, world_id_human_logins IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM world_id_human_logins) THEN
    RAISE EXCEPTION 'Enrollment action migration requires zero verified enrollments';
  END IF;
END $$;
-- Retain historical requests, but only the new action can create verified bindings.
ALTER TABLE world_id_human_login_requests DROP CONSTRAINT world_id_human_login_requests_action_check;
ALTER TABLE world_id_human_login_requests ADD CONSTRAINT world_id_human_login_requests_action_check
  CHECK (action IN ('challengeon-human-login', 'challengeon-human-enroll-v2'));
ALTER TABLE world_id_human_logins DROP CONSTRAINT world_id_human_logins_action_check;
ALTER TABLE world_id_human_logins ADD CONSTRAINT world_id_human_logins_action_check
  CHECK (action = 'challengeon-human-enroll-v2');
COMMIT;
