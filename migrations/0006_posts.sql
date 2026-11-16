-- Legacy rows remain audit history, and cannot pass the DEV05 output gate.
ALTER TABLE generated_posts ADD COLUMN verification_decision_id TEXT REFERENCES verification_decisions(decision_id);
ALTER TABLE generated_posts ADD COLUMN input_digest TEXT;
ALTER TABLE generated_posts ADD COLUMN content_digest TEXT;
ALTER TABLE generated_posts ADD COLUMN length_policy TEXT;
ALTER TABLE generated_posts ADD COLUMN valid_until TEXT;
ALTER TABLE generated_posts ADD COLUMN omissions_json TEXT CHECK(omissions_json IS NULL OR (json_valid(omissions_json) AND length(omissions_json)<=8192));
CREATE VIEW post_generation_schema AS SELECT 1 AS version;
