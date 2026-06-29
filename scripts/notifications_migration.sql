-- First drop the existing constraint. (Assuming standard Supabase/Postgres naming if unnamed, or drop by matching. If the name is known, replace it below. By default, Supabase creates constraint as notifications_notification_type_check)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;

-- Add the updated constraint with the new values
ALTER TABLE notifications ADD CONSTRAINT notifications_notification_type_check 
CHECK (notification_type IN (
    'booking_confirmation', 
    'reschedule_confirmation', 
    'cancellation_confirmation', 
    'reminder_1day', 
    'reminder_15min', 
    'calendar_not_connected_member', 
    'calendar_not_connected_admin',
    'member_invited',
    'platform_super_admin_invited'
));
