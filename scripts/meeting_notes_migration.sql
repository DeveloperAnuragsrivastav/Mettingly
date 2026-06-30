ALTER TABLE ai_insights DROP CONSTRAINT chk_insight_type;
ALTER TABLE ai_insights ADD CONSTRAINT chk_insight_type CHECK (insight_type IN ('booking_summary','meeting_prep','followup_draft','meeting_notes'));

CREATE TABLE meeting_action_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    description           TEXT NOT NULL,
    is_done                 BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_action_items_booking ON meeting_action_items(booking_id);
CREATE INDEX idx_action_items_org ON meeting_action_items(organization_id);

ALTER TABLE meeting_action_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY action_items_isolation ON meeting_action_items FOR ALL TO public
    USING (organization_id = current_member_org_id());
