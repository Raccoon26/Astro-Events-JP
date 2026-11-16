-- Covering bounded management cursors, preserving all existing tables and UNIQUE constraints.
CREATE INDEX events_verified_cursor ON events(stable_event_id,revision) WHERE verification_status='Verified';
CREATE INDEX generated_posts_event_cursor ON generated_posts(event_id,post_id);
