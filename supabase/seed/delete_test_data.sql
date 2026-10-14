-- =============================================================================
-- Fantasy Tennis — delete ALL fake test data in one go
-- Removes fake players, fake scoring rules and fake managers (and anything that
-- points at them). Your real players, rules, managers and settings are kept.
-- =============================================================================
select private.delete_test_data();
