# FocusRunner AI Database Schema

**Last Updated:** 2026-05-30  
**Platform:** PostgreSQL 14+  
**Purpose:** Patient acquisition system for medical aesthetics clinic leads and conversations

---

## Overview

Three core tables manage the lead lifecycle: capture → qualification → booking.

- **leads**: Captured prospective patients from chat, forms, Instagram, referrals
- **conversations**: Chat history and qualification scores for lead interactions
- **bookings**: Appointment confirmations and outcomes

---

## Table: leads

Stores prospective patient contact and metadata.

```sql
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Contact info
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    name VARCHAR(255) NOT NULL,
    
    -- Lead source tracking
    source VARCHAR(50) NOT NULL CHECK (source IN ('chat', 'ig', 'form', 'referral')),
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    
    -- Lead status funnel
    status VARCHAR(50) NOT NULL DEFAULT 'new' CHECK (status IN (
        'new', 'qualified', 'contacted', 'booked', 'lost'
    )),
    
    -- Audit timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_contacted_at TIMESTAMPTZ,
    
    -- Notes and internal context
    notes TEXT
);
```

**Indexes:**

```sql
-- Primary lookup paths
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_phone ON leads(phone);

-- Funnel analytics
CREATE INDEX idx_leads_source ON leads(source);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_status_source ON leads(status, source);

-- Time-based queries
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_last_contacted_at ON leads(last_contacted_at DESC NULLS LAST);

-- Outreach queries
CREATE INDEX idx_leads_status_last_contacted ON leads(status, last_contacted_at) 
    WHERE status IN ('new', 'qualified');
```

---

## Table: conversations

Stores chat sessions and qualification scoring.

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationship
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    session_id VARCHAR(100),
    
    -- Message history as JSON array
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Qualification scoring
    qualified BOOLEAN NOT NULL DEFAULT FALSE,
    qualification_score INTEGER CHECK (qualification_score >= 0 AND qualification_score <= 100),
    
    -- Audit timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Message Schema (inside `messages` JSONB array):**

```json
{
    "role": "user|assistant",
    "content": "message text",
    "timestamp": "2026-05-30T15:33:39Z"
}
```

**Indexes:**

```sql
-- Conversation lookup
CREATE INDEX idx_conversations_lead_id ON conversations(lead_id);

-- Session tracking
CREATE INDEX idx_conversations_session_id ON conversations(session_id);

-- Qualification queries
CREATE INDEX idx_conversations_qualified ON conversations(qualified);
CREATE INDEX idx_conversations_lead_qualified ON conversations(lead_id, qualified);

-- Time-based
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);

-- JSONB search (support message content queries)
CREATE INDEX idx_conversations_messages_gin ON conversations USING GIN(messages);
```

---

## Table: bookings

Stores appointment bookings and outcomes.

```sql
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationship
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    
    -- Booking details
    clinic_name VARCHAR(255) NOT NULL,
    appointment_date TIMESTAMPTZ NOT NULL,
    procedure_type VARCHAR(255) NOT NULL,
    
    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'completed', 'cancelled', 'no_show'
    )),
    
    -- Audit timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**

```sql
-- Primary lookups
CREATE INDEX idx_bookings_lead_id ON bookings(lead_id);

-- Status tracking
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_lead_status ON bookings(lead_id, status);

-- Appointment queries
CREATE INDEX idx_bookings_appointment_date ON bookings(appointment_date DESC);
CREATE INDEX idx_bookings_clinic_date ON bookings(clinic_name, appointment_date);

-- Time-based
CREATE INDEX idx_bookings_created_at ON bookings(created_at DESC);
```

---

## Entity-Relationship Diagram

```
┌─────────────────────────────┐
│          LEADS              │
├─────────────────────────────┤
│ id (UUID) [PK]              │
│ email (VARCHAR) [UNIQUE]    │
│ phone (VARCHAR)             │
│ name (VARCHAR)              │
│ source (VARCHAR) [INDEX]    │
│ utm_source                  │
│ utm_medium                  │
│ utm_campaign                │
│ status (VARCHAR) [INDEX]    │
│ created_at [INDEX]          │
│ updated_at                  │
│ last_contacted_at [INDEX]   │
│ notes (TEXT)                │
└──────────┬──────────────────┘
           │ 1
           │ (CASCADE)
           │ lead_id (FK)
           │
     ┌─────▼──────────────────┐      ┌──────────────────────┐
     │   CONVERSATIONS        │      │     BOOKINGS         │
     ├──────────────────────┤      ├──────────────────────┤
     │ id (UUID) [PK]       │      │ id (UUID) [PK]       │
     │ lead_id (FK) [INDEX] │      │ lead_id (FK) [INDEX] │
     │ session_id [INDEX]   │      │ clinic_name          │
     │ messages (JSONB)     │      │ appointment_date     │
     │ qualified (BOOL)     │      │ procedure_type       │
     │ qualification_score  │      │ status [INDEX]       │
     │ created_at [INDEX]   │      │ created_at [INDEX]   │
     │ updated_at           │      │ updated_at           │
     └──────────────────────┘      └──────────────────────┘
           │ N                            │ N
           │                             │
           └──────────1──────────────────┘
           (one lead → many conversations, many bookings)
```

---

## Migration Strategy

### Phase 1: Schema Creation

1. Create tables with all indexes in a single transaction
2. Verify constraints and relationships

### Phase 2: Data Migration (from leads.json)

Existing lead data is stored in `leads.json` (git-tracked import file). To migrate:

```sql
-- Insert leads from JSON import (pseudo-example)
INSERT INTO leads (email, phone, name, source, status, notes, created_at, updated_at)
SELECT 
    (data->>'email')::VARCHAR,
    (data->>'phone')::VARCHAR,
    (data->>'name')::VARCHAR,
    COALESCE((data->>'source')::VARCHAR, 'form') AS source,
    'new'::VARCHAR AS status,
    (data->>'notes')::TEXT,
    COALESCE((data->>'created_at')::TIMESTAMPTZ, CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM (SELECT jsonb_each(leads_json) AS data) AS t
ON CONFLICT(email) DO NOTHING;
```

**Steps:**

1. Create a temporary `leads.json` file in the database directory (if not already present)
2. Use `psql \COPY` or a Python/Node migration script to parse `leads.json`
3. Insert rows with `ON CONFLICT(email) DO NOTHING` to avoid duplicates
4. Set initial status to `'new'` for all imported leads
5. Backfill `created_at` from JSON timestamps where available

### Phase 3: Post-Migration Verification

```sql
-- Verify lead counts
SELECT COUNT(*) FROM leads;

-- Check for orphaned conversations (should be empty initially)
SELECT COUNT(*) FROM conversations WHERE lead_id NOT IN (SELECT id FROM leads);

-- Check for orphaned bookings (should be empty initially)
SELECT COUNT(*) FROM bookings WHERE lead_id NOT IN (SELECT id FROM leads);

-- Verify unique email constraint
SELECT email, COUNT(*) FROM leads GROUP BY email HAVING COUNT(*) > 1;
```

---

## Constraints & Integrity

| Constraint | Table | Details |
|-----------|-------|---------|
| Email uniqueness | leads | Each lead has one email (primary contact key) |
| CHECK source | leads | Only `chat`, `ig`, `form`, `referral` |
| CHECK status (leads) | leads | Only `new`, `qualified`, `contacted`, `booked`, `lost` |
| CHECK status (bookings) | bookings | Only `scheduled`, `completed`, `cancelled`, `no_show` |
| CHECK qualification_score | conversations | 0–100 integer scale |
| FK lead_id (CASCADE) | conversations | Deleting a lead cascades to conversations |
| FK lead_id (CASCADE) | bookings | Deleting a lead cascades to bookings |

---

## Common Queries

### Get unqualified new leads (outreach candidates)
```sql
SELECT l.id, l.name, l.email, l.phone, l.created_at
FROM leads l
LEFT JOIN conversations c ON l.id = c.lead_id
WHERE l.status = 'new'
  AND (c.qualified IS FALSE OR c.id IS NULL)
ORDER BY l.created_at ASC
LIMIT 20;
```

### Get booked leads (conversion funnel)
```sql
SELECT l.name, l.email, b.clinic_name, b.appointment_date, b.procedure_type
FROM leads l
INNER JOIN bookings b ON l.id = b.lead_id
WHERE b.status = 'scheduled'
  AND b.appointment_date >= CURRENT_DATE
ORDER BY b.appointment_date ASC;
```

### Conversion metrics by source
```sql
SELECT 
    l.source,
    COUNT(DISTINCT l.id) AS total_leads,
    COUNT(DISTINCT CASE WHEN l.status = 'qualified' THEN l.id END) AS qualified_leads,
    COUNT(DISTINCT b.id) AS booked_count,
    ROUND(
        100.0 * COUNT(DISTINCT b.id) / NULLIF(COUNT(DISTINCT l.id), 0), 
        2
    ) AS conversion_rate_percent
FROM leads l
LEFT JOIN bookings b ON l.id = b.lead_id AND b.status = 'completed'
GROUP BY l.source
ORDER BY total_leads DESC;
```

### Recent conversation activity
```sql
SELECT 
    l.name, 
    l.email, 
    c.session_id,
    c.qualified,
    c.qualification_score,
    c.updated_at
FROM leads l
INNER JOIN conversations c ON l.id = c.lead_id
WHERE c.updated_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY c.updated_at DESC;
```

---

## Performance Notes

1. **Email lookup** (`idx_leads_email`): Used on every duplicate-check during lead capture → essential.
2. **Status + Source** (`idx_leads_status_source`): Supports funnel analytics and segmentation queries.
3. **Created_at DESC**: Supports "recent leads" queries and pagination.
4. **JSONB GIN index** (`idx_conversations_messages_gin`): Enables full-text or content searches on chat history (optional, add if search is needed).
5. **FK cascades**: When a lead is deleted, all conversations and bookings are removed automatically.

---

## Backup & Disaster Recovery

1. **Daily backups**: Schedule `pg_dump` of this schema nightly
2. **Point-in-time recovery**: Enable WAL archiving
3. **Table-level backup for leads.json**: Periodic export of leads table to JSON for audit trail

---

## Future Extensibility

- **User/Agent table**: Track which team member owned each lead conversation
- **Audit log table**: Track status changes, annotations, and who made them
- **Custom fields table**: Allow clinic-specific metadata per lead
- **Tagging system**: Many-to-many tags for lead segmentation (e.g., "VIP", "Follow-up needed")
- **CRM integration table**: Track syncs to external systems (Salesforce, HubSpot, etc.)

---

**Schema Version:** 1.0  
**Author:** CTO / Sr Engineer  
**Status:** Ready for implementation
