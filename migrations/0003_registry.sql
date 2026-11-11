CREATE TABLE registry_metadata (kind TEXT NOT NULL CHECK(kind IN ('source','facility','vtuber')), record_id TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), PRIMARY KEY(kind,record_id));
CREATE TABLE registry_urls (kind TEXT NOT NULL, url TEXT NOT NULL, record_id TEXT NOT NULL, PRIMARY KEY(kind,url));
CREATE TABLE registry_history (history_id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL REFERENCES sources(source_id), changed_at TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL);
CREATE INDEX sources_category_state ON sources(category,state,prefecture,next_crawl_at);
CREATE INDEX sources_prefecture ON sources(prefecture,source_id);
CREATE INDEX facilities_prefecture ON facilities(prefecture,facility_id);
CREATE TABLE facility_sources (facility_id TEXT NOT NULL REFERENCES facilities(facility_id), source_id TEXT NOT NULL REFERENCES sources(source_id), PRIMARY KEY(facility_id,source_id));
