/**
 * GoHighLevel Contact Sync — auto-create GHL contacts from chatbot leads.
 *
 * POSTs new contacts to GoHighLevel Contacts API with custom fields
 * mapped from FocusRunner's lead qualification data.
 *
 * Env vars:
 *   GHL_API_KEY       — required, GoHighLevel API key
 *   GHL_LOCATION_ID   — optional, GHL location ID
 */

const GHL_API_BASE = 'https://rest.gohighlevel.com/v1';
const TAG = 'focusrunner_chat';

/**
 * Create or update a contact in GoHighLevel.
 *
 * @param {object} leadData       — raw lead data from the chat widget (name, phone, email, practice, niche, volume)
 * @param {object} qualification  — parsed qualification JSON { score, classification, budget_tier, timeline, summary }
 * @param {string} clientId       — FocusRunner client identifier for analytics
 * @returns {Promise<object|null>} — { id, contact } from GHL, or null on failure
 */
export async function createGHLContact(leadData, qualification, clientId) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    console.warn('[ghl-sync] GHL_API_KEY not set — skipping contact sync');
    return null;
  }

  const payload = {
    name: leadData.name || 'Chat Widget Lead',
    phone: leadData.phone || '',
    email: leadData.email || '',
    tags: [TAG],
  };

  if (leadData.practice) {
    payload.companyName = leadData.practice;
  }

  // Custom fields — GHL v1 uses customField as a flat key-value object
  const customFields = {};

  if (leadData.practice) customFields.practice_name = leadData.practice;
  if (leadData.niche) customFields.niche = leadData.niche;
  if (leadData.volume) customFields.patient_volume = leadData.volume;
  if (clientId) customFields.focusrunner_client = clientId;

  // Qualification data
  if (qualification) {
    customFields.source = 'focusrunner_chat';
    customFields.qualification_score = String(qualification.score ?? 0);
    customFields.qualification_class = qualification.classification || 'unknown';
    customFields.budget_tier = qualification.budget_tier || 'unknown';
    customFields.timeline = qualification.timeline || 'unknown';
    customFields.lead_summary = qualification.summary || '';
  }

  // Add locationId if configured
  const locationId = process.env.GHL_LOCATION_ID;
  if (locationId) {
    customFields.location_id = locationId;
  }

  if (Object.keys(customFields).length > 0) {
    payload.customField = customFields;
  }

  try {
    const res = await fetch(`${GHL_API_BASE}/contacts/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json();

    if (!res.ok) {
      console.error(`[ghl-sync] GHL API error ${res.status}:`, JSON.stringify(body).slice(0, 300));
      return null;
    }

    console.log(`[ghl-sync] Contact created: id=${body.contact?.id || body.id} name=${leadData.name}`);
    return body;
  } catch (err) {
    console.error('[ghl-sync] Network error:', err.message);
    return null;
  }
}

export default createGHLContact;
